#include "MyAudioStreamer.h"
#include "WebSocketsModule.h"
#include "Json.h"
#include "JsonUtilities.h"

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

            if (Type == TEXT("result"))
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

        // ダウンサンプリング: SampleRate → 16kHz
        constexpr int32 TargetSampleRate = 16000;
        const int32 DownsampleRatio = FMath::Max(1, SampleRate / TargetSampleRate);
        const int32 OutputFrames = NumFrames / DownsampleRatio;

        TArray<uint8> Buffer;
        Buffer.SetNumUninitialized(OutputFrames * sizeof(int16));
        int16* PCM16 = reinterpret_cast<int16*>(Buffer.GetData());

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

        // デバッグ: 音声レベル
        static int32 LogCounter = 0;
        if (++LogCounter % 100 == 0)
        {
            float MaxSample = 0.0f;
            for (int32 i = 0; i < OutputFrames; ++i)
            {
                MaxSample = FMath::Max(MaxSample, FMath::Abs(static_cast<float>(PCM16[i])));
            }
            UE_LOG(LogTemp, Warning, TEXT("AudioCapture: MaxSample=%f (of 32767) Frames=%d SR=%d Ch=%d"),
                MaxSample, OutputFrames, SampleRate, NumChannels);
        }

        SendQueue.Enqueue(MoveTemp(Buffer));
    };

    // 16kHzで十分だが、デバイスのネイティブレートでキャプチャ
    Audio::FAudioCaptureDeviceParams Params;
    AudioCapture.OpenCaptureStream(Params, MoveTemp(OnCapture), 1024);
    AudioCapture.StartStream();

    UE_LOG(LogTemp, Warning, TEXT("MyAudioStreamer: AudioCapture stream started."));
}

void AMyAudioStreamer::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);

    if (!WebSocket.IsValid() || !WebSocket->IsConnected())
    {
        return;
    }

    TArray<uint8> Buffer;
    while (SendQueue.Dequeue(Buffer))
    {
        WebSocket->Send(Buffer.GetData(), Buffer.Num(), true);
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
    Super::EndPlay(EndPlayReason);
}
