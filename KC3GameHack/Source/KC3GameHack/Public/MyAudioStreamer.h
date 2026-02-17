#pragma once

#include "CoreMinimal.h"
#include "IWebSocket.h"
#include "AudioCaptureCore.h"
#include "Containers/Queue.h"
#include "MyAudioStreamer.generated.h"


// 1. 効果の種類を定義
UENUM(BlueprintType)
enum class EEffectType : uint8
{
	None,
	Heat,
	Cold,
	Electric,
	Light,
	FrictionReduce,
	Bounce,
	MassHeavy,
	MassLight,
	SpeedFast,
	SpeedSlow
};

// 2. 認識結果の構造体
USTRUCT(BlueprintType)
struct FWordDefinition
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "AudioStream")
	FString Id;

	UPROPERTY(BlueprintReadOnly, Category = "AudioStream")
	FString Text;

	UPROPERTY(BlueprintReadOnly, Category = "AudioStream")
	int32 VoiceIntensity = 0;

	UPROPERTY(BlueprintReadOnly, Category = "AudioStream")
	TArray<EEffectType> Effects;
};

// 3. Blueprint用のデリゲート定義
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnWordRecognized, FWordDefinition, WordData);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnInterimTextReceived, FString, InterimText);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnStreamError, FString, ErrorMessage);

UCLASS()
class AMyAudioStreamer : public AActor
{
    GENERATED_BODY()

public:
    AMyAudioStreamer();

    UPROPERTY(EditAnywhere, Category = "AudioStream")
    FString ServerUrl = TEXT("ws://localhost:3001/ws/stt");

    // --- Blueprint Events ---
    UPROPERTY(BlueprintAssignable, Category = "AudioStream|Events")
    FOnWordRecognized OnWordRecognized;

    UPROPERTY(BlueprintAssignable, Category = "AudioStream|Events")
    FOnInterimTextReceived OnInterimTextReceived;

    UPROPERTY(BlueprintAssignable, Category = "AudioStream|Events")
    FOnStreamError OnStreamError;

protected:
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaTime) override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

private:
    TSharedPtr<IWebSocket> WebSocket;

    // 直接マイクキャプチャ
    Audio::FAudioCapture AudioCapture;
    TQueue<TArray<uint8>> SendQueue;

    // サーバーの文字列をEnumに変換するヘルパー
    EEffectType StringToEffectType(FString EffectStr);
};
