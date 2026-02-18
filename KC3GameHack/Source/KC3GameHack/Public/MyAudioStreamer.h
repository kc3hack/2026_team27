#pragma once

#include "CoreMinimal.h"
#include "ISubmixBufferListener.h"
#include "IWebSocket.h"
#include "MyAudioStreamer.generated.h"

class FSubmixBufferListenerForStreamer : public ISubmixBufferListener
{
public:
    TWeakPtr<IWebSocket> WebSocket;

    virtual void OnNewSubmixBuffer(const USoundSubmix* OwningSubmix, float* AudioData, int32 NumSamples, int32 NumChannels, const int32 SampleRate, double AudioClock) override;
    virtual bool IsRenderingAudio() const override { return true; }
};

UCLASS()
class AMyAudioStreamer : public AActor
{
    GENERATED_BODY()

public:
    UPROPERTY(EditAnywhere, Category = "AudioStream")
    USoundSubmix* TargetSubmix;

    UPROPERTY(EditAnywhere, Category = "AudioStream")
    FString ServerUrl = TEXT("ws://localhost:8080");

protected:
    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

private:
    TSharedPtr<IWebSocket> WebSocket;
    TSharedPtr<FSubmixBufferListenerForStreamer, ESPMode::ThreadSafe> SubmixListener;
};
