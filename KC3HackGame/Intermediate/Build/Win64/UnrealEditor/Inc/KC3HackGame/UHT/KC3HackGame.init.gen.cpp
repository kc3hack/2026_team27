// Copyright Epic Games, Inc. All Rights Reserved.
/*===========================================================================
	Generated code exported from UnrealHeaderTool.
	DO NOT modify this manually! Edit the corresponding .h files instead!
===========================================================================*/

#include "UObject/GeneratedCppIncludes.h"
PRAGMA_DISABLE_DEPRECATION_WARNINGS
void EmptyLinkFunctionForGeneratedCodeKC3HackGame_init() {}
	KC3HACKGAME_API UFunction* Z_Construct_UDelegateFunction_KC3HackGame_OnEnemyDied__DelegateSignature();
	static FPackageRegistrationInfo Z_Registration_Info_UPackage__Script_KC3HackGame;
	FORCENOINLINE UPackage* Z_Construct_UPackage__Script_KC3HackGame()
	{
		if (!Z_Registration_Info_UPackage__Script_KC3HackGame.OuterSingleton)
		{
			static UObject* (*const SingletonFuncArray[])() = {
				(UObject* (*)())Z_Construct_UDelegateFunction_KC3HackGame_OnEnemyDied__DelegateSignature,
			};
			static const UECodeGen_Private::FPackageParams PackageParams = {
				"/Script/KC3HackGame",
				SingletonFuncArray,
				UE_ARRAY_COUNT(SingletonFuncArray),
				PKG_CompiledIn | 0x00000000,
				0x27009831,
				0x22F882EC,
				METADATA_PARAMS(0, nullptr)
			};
			UECodeGen_Private::ConstructUPackage(Z_Registration_Info_UPackage__Script_KC3HackGame.OuterSingleton, PackageParams);
		}
		return Z_Registration_Info_UPackage__Script_KC3HackGame.OuterSingleton;
	}
	static FRegisterCompiledInInfo Z_CompiledInDeferPackage_UPackage__Script_KC3HackGame(Z_Construct_UPackage__Script_KC3HackGame, TEXT("/Script/KC3HackGame"), Z_Registration_Info_UPackage__Script_KC3HackGame, CONSTRUCT_RELOAD_VERSION_INFO(FPackageReloadVersionInfo, 0x27009831, 0x22F882EC));
PRAGMA_ENABLE_DEPRECATION_WARNINGS
