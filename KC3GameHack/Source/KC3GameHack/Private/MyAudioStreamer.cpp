#include "MyAudioStreamer.h"
#include "AudioDevice.h"
#include "WebSocketsModule.h"

void FSubmixBufferListenerForStreamer::OnNewSubmixBuffer(const USoundSubmix* OwningSubmix, float* AudioData, int32 NumSamples, int32 NumChannels, const int32 SampleRate, double AudioClock)
{
    static int32 LogCounter = 0;
    if (++LogCounter % 60 == 0)
    {
        UE_LOG(LogTemp, Warning, TEXT("Streaming: Buffer Received! Samples=%d, SampleRate=%d"), NumSamples, SampleRate);
    }
    TSharedPtr<IWebSocket> Ws = WebSocket.Pin();
    if (Ws.IsValid() && Ws->IsConnected())
    {
        Ws->Send(AudioData, NumSamples * sizeof(float), true);
    }
}

void AMyAudioStreamer::BeginPlay()
{
    Super::BeginPlay();

    WebSocket = FWebSocketsModule::Get().CreateWebSocket(ServerUrl);
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
