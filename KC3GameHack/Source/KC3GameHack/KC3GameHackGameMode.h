// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "KC3GameHackGameMode.generated.h"

/**
 *  Simple GameMode for a third person game
 */
UCLASS(abstract)
class AKC3GameHackGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	
	/** Constructor */
	AKC3GameHackGameMode();
};



