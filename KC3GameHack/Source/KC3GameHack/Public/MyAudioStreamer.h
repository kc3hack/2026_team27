#pragma once

#include "CoreMinimal.h"
#include "IWebSocket.h"
#include "AudioCaptureCore.h"
#include "Containers/Queue.h"
#include <atomic>
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

    // オーディオスレッド側でコールバック毎の小バッファを蓄積し、
    // 一定量（~50ms分）溜まってからキューに投入してオーバーヘッドを削減
    TArray<uint8> CaptureAccumulator; // オーディオスレッドからのみアクセス

    // キュー深度の近似値（バイト数）。溜まりすぎたら古い音声を破棄しリアルタイム性を維持
    std::atomic<int32> QueuedAudioBytes{0};

    // Deepgramが準備完了したか（サーバーから "connected" を受け取るまで音声送信しない）
    bool bServerReady = false;

    // 音声バイナリダンプ用ファイルハンドル
    IFileHandle* AudioDumpFile = nullptr;

    // 計測用
    int32 CaptureCallbackCount = 0;
    int32 TickSendCount = 0;

    // サーバーの文字列をEnumに変換するヘルパー
    EEffectType StringToEffectType(FString EffectStr);
};
