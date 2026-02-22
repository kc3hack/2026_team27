#include "MyAudioStreamer.h"
#include "WebSocketsModule.h"
#include "Json.h"
#include "JsonUtilities.h"
#include "HAL/PlatformFileManager.h"

AMyAudioStreamer::AMyAudioStreamer()
{
    PrimaryActorTick.bCanEverTick = true;
}

void AMyAudioStreamer::BeginPlay()
{
    Super::BeginPlay();

    // --- WebSocket セットアップ ---
    WebSocket = FWebSocketsModule::Get().CreateWebSocket(ServerUrl);

    WebSocket->OnConnected().AddLambda([]()
    {
        UE_LOG(LogTemp, Warning, TEXT("MyAudioStreamer: WebSocket connected!"));
    });

    WebSocket->OnClosed().AddLambda([this](int32 StatusCode, const FString& Reason, bool bWasClean)
    {
        UE_LOG(LogTemp, Warning, TEXT("MyAudioStreamer: WebSocket closed (code=%d)"), StatusCode);
        bServerReady = false;
    });

    WebSocket->OnConnectionError().AddLambda([](const FString& Error)
    {
        UE_LOG(LogTemp, Error, TEXT("MyAudioStreamer: WebSocket connection error: %s"), *Error);
    });

    // --- 受信イベント（JSONパース実装） ---
    WebSocket->OnMessage().AddLambda([this](const FString& MessageString)
    {
        UE_LOG(LogTemp, Warning, TEXT("MyAudioStreamer: Received: %s"), *MessageString);

        TSharedPtr<FJsonObject> JsonObject;
        TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(MessageString);

        if (FJsonSerializer::Deserialize(Reader, JsonObject))
        {
            FString Type = JsonObject->GetStringField(TEXT("type"));

            if (Type == TEXT("connected"))
            {
                bServerReady = true;
                UE_LOG(LogTemp, Warning, TEXT("MyAudioStreamer: Server ready (Deepgram connected). Starting audio stream."));
            }
            else if (Type == TEXT("result"))
            {
                const TSharedPtr<FJsonObject>* DataObj;
                if (JsonObject->TryGetObjectField(TEXT("data"), DataObj))
                {
                    FWordDefinition Result;
                    Result.Id = (*DataObj)->GetStringField(TEXT("id"));
                    Result.Text = (*DataObj)->GetStringField(TEXT("text"));
                    Result.VoiceIntensity = (*DataObj)->GetIntegerField(TEXT("voiceIntensity"));

                    TArray<TSharedPtr<FJsonValue>> EffectsArray = (*DataObj)->GetArrayField(TEXT("effects"));
                    for (auto Value : EffectsArray)
                    {
                        Result.Effects.Add(StringToEffectType(Value->AsString()));
                    }

                    OnWordRecognized.Broadcast(Result);
                }
            }
            else if (Type == TEXT("interim"))
            {
                OnInterimTextReceived.Broadcast(JsonObject->GetStringField(TEXT("text")));
            }
            else if (Type == TEXT("error"))
            {
                OnStreamError.Broadcast(JsonObject->GetStringField(TEXT("message")));
            }
        }
    });

    WebSocket->Connect();

    // --- マイクキャプチャ開始 (FAudioCapture) ---
    Audio::FCaptureDeviceInfo DeviceInfo;
    if (AudioCapture.GetCaptureDeviceInfo(DeviceInfo))
    {
        UE_LOG(LogTemp, Warning, TEXT("MyAudioStreamer: Mic device: %s, SampleRate=%d, Channels=%d"),
            *DeviceInfo.DeviceName, DeviceInfo.PreferredSampleRate, DeviceInfo.InputChannels);
    }

    Audio::FOnCaptureFunction OnCapture = [this](const float* FloatData, int32 NumFrames, int32 NumChannels, int32 SampleRate, double StreamTime, bool bOverflow)
    {
        if (bOverflow)
        {
            UE_LOG(LogTemp, Warning, TEXT("[UE] Audio capture buffer overflow!"));
        }

        // ダウンサンプリング: SampleRate → 16kHz, ステレオ → モノラル
        constexpr int32 TargetSampleRate = 16000;
        const int32 DownsampleRatio = FMath::Max(1, SampleRate / TargetSampleRate);
        const int32 OutputFrames = NumFrames / DownsampleRatio;
        const int32 OutputBytes = OutputFrames * sizeof(int16);

        // CaptureAccumulator に直接書き込み（コールバック毎のTArray生成を回避）
        const int32 StartIndex = CaptureAccumulator.AddUninitialized(OutputBytes);
        int16* PCM16 = reinterpret_cast<int16*>(CaptureAccumulator.GetData() + StartIndex);

        for (int32 i = 0; i < OutputFrames; ++i)
        {
            const int32 SrcFrame = i * DownsampleRatio;
            float Sample = 0.0f;
            for (int32 Ch = 0; Ch < NumChannels; ++Ch)
            {
                Sample += FloatData[SrcFrame * NumChannels + Ch];
            }
            Sample /= FMath::Max(1, NumChannels);
            Sample = FMath::Clamp(Sample, -1.0f, 1.0f);
            PCM16[i] = static_cast<int16>(Sample * 32767.0f);
        }

        // 50ms分(1600B @ 16kHz mono 16bit)溜まったらキューに投入
        // コールバック毎に320Bずつ個別Enqueueしていた状態を改善し、
        // TQueue操作を~1/5に削減
        constexpr int32 BatchBytes = 1600;
        if (CaptureAccumulator.Num() >= BatchBytes)
        {
            // キュー深度チェック: 500ms(16000B)を超えたら古い音声を破棄
            // リアルタイム性を維持し、ゲームFPS低下時のバックログ蓄積を防止
            constexpr int32 MaxQueueBytes = 16000;
            if (QueuedAudioBytes.load(std::memory_order_relaxed) < MaxQueueBytes)
            {
                QueuedAudioBytes.fetch_add(CaptureAccumulator.Num(), std::memory_order_relaxed);
                SendQueue.Enqueue(MoveTemp(CaptureAccumulator));
            }
            CaptureAccumulator.Reset();
            CaptureAccumulator.Reserve(BatchBytes);
        }

        if (++CaptureCallbackCount % 200 == 0)
        {
            UE_LOG(LogTemp, Warning,
                TEXT("[TIMING][UE] Capture #%d (Frames=%d Out=%dB QueueDepth~%dB)"),
                CaptureCallbackCount, NumFrames, OutputBytes,
                QueuedAudioBytes.load(std::memory_order_relaxed));
        }
    };

    // 16kHzで十分だが、デバイスのネイティブレートでキャプチャ
    Audio::FAudioCaptureDeviceParams Params;
    AudioCapture.OpenCaptureStream(Params, MoveTemp(OnCapture), 1024);
    AudioCapture.StartStream();

    UE_LOG(LogTemp, Warning, TEXT("MyAudioStreamer: AudioCapture stream started."));

    // 音声バイナリダンプファイルを開く（上書き）
    const FString DumpPath = TEXT("C:/Users/a7p7p/Downloads/TestFile");
    AudioDumpFile = FPlatformFileManager::Get().GetPlatformFile().OpenWrite(*DumpPath, /*bAppend=*/false, /*bAllowRead=*/false);
    if (AudioDumpFile)
    {
        UE_LOG(LogTemp, Warning, TEXT("MyAudioStreamer: Audio dump file opened: %s"), *DumpPath);
    }
    else
    {
        UE_LOG(LogTemp, Error, TEXT("MyAudioStreamer: Failed to open audio dump file: %s"), *DumpPath);
    }
}

void AMyAudioStreamer::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);

    if (!WebSocket.IsValid() || !WebSocket->IsConnected() || !bServerReady)
    {
        TArray<uint8> Discarded;
        while (SendQueue.Dequeue(Discarded)) {}
        QueuedAudioBytes.store(0, std::memory_order_relaxed);
        return;
    }

    // キューの全バッチを1つに結合して1回のWebSocket送信にまとめる
    TArray<uint8> CombinedBuffer;
    TArray<uint8> Buffer;
    int32 ChunksDequeued = 0;
    while (SendQueue.Dequeue(Buffer))
    {
        CombinedBuffer.Append(Buffer);
        ++ChunksDequeued;
    }
    QueuedAudioBytes.store(0, std::memory_order_relaxed);

    if (CombinedBuffer.Num() > 0)
    {
        WebSocket->Send(CombinedBuffer.GetData(), CombinedBuffer.Num(), true);

        if (AudioDumpFile)
        {
            AudioDumpFile->Write(CombinedBuffer.GetData(), CombinedBuffer.Num());
        }

        ++TickSendCount;
        if (TickSendCount % 30 == 0)
        {
            UE_LOG(LogTemp, Warning,
                TEXT("[TIMING][UE] Tick #%d: %d batches (%d bytes) | DeltaTime=%.1fms"),
                TickSendCount, ChunksDequeued, CombinedBuffer.Num(), DeltaTime * 1000.0f);
        }
    }
}

EEffectType AMyAudioStreamer::StringToEffectType(FString EffectStr)
{
    if (EffectStr == "heat") return EEffectType::Heat;
    if (EffectStr == "cold") return EEffectType::Cold;
    if (EffectStr == "electric") return EEffectType::Electric;
    if (EffectStr == "light") return EEffectType::Light;
    if (EffectStr == "friction_reduce") return EEffectType::FrictionReduce;
    if (EffectStr == "bounce") return EEffectType::Bounce;
    if (EffectStr == "mass_heavy") return EEffectType::MassHeavy;
    if (EffectStr == "mass_light") return EEffectType::MassLight;
    if (EffectStr == "speed_fast") return EEffectType::SpeedFast;
    if (EffectStr == "speed_slow") return EEffectType::SpeedSlow;
    return EEffectType::None;
}

void AMyAudioStreamer::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    AudioCapture.StopStream();
    AudioCapture.CloseStream();
    if (WebSocket.IsValid()) WebSocket->Close();
    if (AudioDumpFile)
    {
        delete AudioDumpFile;
        AudioDumpFile = nullptr;
    }
    Super::EndPlay(EndPlayReason);
}
