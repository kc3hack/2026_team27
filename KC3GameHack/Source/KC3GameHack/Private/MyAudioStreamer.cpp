#include "MyAudioStreamer.h"
#include "AudioDevice.h"
#include "WebSocketsModule.h"

void FSubmixBufferListenerForStreamer::OnNewSubmixBuffer(const USoundSubmix* OwningSubmix, float* AudioData, int32 NumSamples, int32 NumChannels, const int32 SampleRate, double AudioClock)
{
    static int32 LogCounter = 0;
    if (++LogCounter % 60 == 0)
    {
        UE_LOG(LogTemp, Warning, TEXT("Streaming: Buffer Received! Samples=%d, Channels=%d, SampleRate=%d"), NumSamples, NumChannels, SampleRate);
    }

    // NumSamples is total samples across all channels (= frames * channels)
    const int32 NumFrames = (NumChannels > 0) ? NumSamples / NumChannels : NumSamples;

    // Downsample ratio: e.g. 48000 -> 16000 = ratio 3
    constexpr int32 TargetSampleRate = 16000;
    const int32 DownsampleRatio = FMath::Max(1, SampleRate / TargetSampleRate);

    const int32 OutputFrames = NumFrames / DownsampleRatio;
    TArray<uint8> Buffer;
    Buffer.SetNumUninitialized(OutputFrames * sizeof(int16));
    int16* PCM16 = reinterpret_cast<int16*>(Buffer.GetData());

    for (int32 i = 0; i < OutputFrames; ++i)
    {
        const int32 SrcFrame = i * DownsampleRatio;

        // Mix all channels to mono by averaging
        float Sample = 0.0f;
        for (int32 Ch = 0; Ch < NumChannels; ++Ch)
        {
            Sample += AudioData[SrcFrame * NumChannels + Ch];
        }
        Sample /= FMath::Max(1, NumChannels);

        // Clamp and convert float [-1.0, 1.0] to int16 [-32768, 32767]
        Sample = FMath::Clamp(Sample, -1.0f, 1.0f);
        PCM16[i] = static_cast<int16>(Sample * 32767.0f);
    }

    // Enqueue for game thread to send (TQueue is lock-free, thread-safe)
    SendQueue.Enqueue(MoveTemp(Buffer));
}

AMyAudioStreamer::AMyAudioStreamer()
{
    PrimaryActorTick.bCanEverTick = true;
}

void AMyAudioStreamer::BeginPlay()
{
    Super::BeginPlay();

    WebSocket = FWebSocketsModule::Get().CreateWebSocket(ServerUrl);

    WebSocket->OnConnected().AddLambda([]()
    {
        UE_LOG(LogTemp, Warning, TEXT("MyAudioStreamer: WebSocket connected!"));
    });
    WebSocket->OnConnectionError().AddLambda([](const FString& Error)
    {
        UE_LOG(LogTemp, Error, TEXT("MyAudioStreamer: WebSocket connection error: %s"), *Error);
    });
    WebSocket->OnClosed().AddLambda([](int32 StatusCode, const FString& Reason, bool bWasClean)
    {
        UE_LOG(LogTemp, Warning, TEXT("MyAudioStreamer: WebSocket closed. Code=%d Reason=%s Clean=%d"), StatusCode, *Reason, bWasClean);
    });

    WebSocket->Connect();

    SubmixListener = MakeShared<FSubmixBufferListenerForStreamer, ESPMode::ThreadSafe>();
    SubmixListener->WebSocket = WebSocket;

    if (!TargetSubmix)
    {
        UE_LOG(LogTemp, Error, TEXT("MyAudioStreamer: TargetSubmix is not set!"));
    }
    if (!GEngine || !GEngine->GetMainAudioDevice())
    {
        UE_LOG(LogTemp, Error, TEXT("MyAudioStreamer: AudioDevice is not available!"));
    }

    if (GEngine && GEngine->GetMainAudioDevice() && TargetSubmix)
    {
        GEngine->GetMainAudioDevice()->RegisterSubmixBufferListener(SubmixListener.ToSharedRef(), *TargetSubmix);
        UE_LOG(LogTemp, Warning, TEXT("MyAudioStreamer: Registered submix listener successfully."));
    }
}

void AMyAudioStreamer::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);

    if (!WebSocket.IsValid() || !WebSocket->IsConnected() || !SubmixListener.IsValid())
    {
        return;
    }

    // Drain the queue on the game thread and send via WebSocket
    TArray<uint8> Buffer;
    while (SubmixListener->SendQueue.Dequeue(Buffer))
    {
        WebSocket->Send(Buffer.GetData(), Buffer.Num(), true);
    }
}

void AMyAudioStreamer::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    if (GEngine && GEngine->GetMainAudioDevice() && TargetSubmix && SubmixListener.IsValid())
    {
        GEngine->GetMainAudioDevice()->UnregisterSubmixBufferListener(SubmixListener.ToSharedRef(), *TargetSubmix);
    }
    SubmixListener.Reset();
    if (WebSocket.IsValid()) WebSocket->Close();
    Super::EndPlay(EndPlayReason);
}
