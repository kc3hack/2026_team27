#pragma once

#include "CoreMinimal.h"
#include "ISubmixBufferListener.h"
#include "IWebSocket.h"
#include "MyAudioStreamer.generated.h"

class FSubmixBufferListenerForStreamer : public ISubmixBufferListener
{
public:
    TWeakPtr<IWebSocket> WebSocket;

    // Thread-safe queue: audio thread enqueues, game thread dequeues & sends
    TQueue<TArray<uint8>> SendQueue;

    virtual void OnNewSubmixBuffer(const USoundSubmix* OwningSubmix, float* AudioData, int32 NumSamples, int32 NumChannels, const int32 SampleRate, double AudioClock) override;
    virtual bool IsRenderingAudio() const override { return true; }
};

UCLASS()
class AMyAudioStreamer : public AActor
{
    GENERATED_BODY()

public:
    AMyAudioStreamer();

    UPROPERTY(EditAnywhere, Category = "AudioStream")
    USoundSubmix* TargetSubmix;

    UPROPERTY(EditAnywhere, Category = "AudioStream")
    FString ServerUrl = TEXT("ws://localhost:3001/ws/stt");

protected:
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaTime) override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

private:
    TSharedPtr<IWebSocket> WebSocket;
    TSharedPtr<FSubmixBufferListenerForStreamer, ESPMode::ThreadSafe> SubmixListener;
};
