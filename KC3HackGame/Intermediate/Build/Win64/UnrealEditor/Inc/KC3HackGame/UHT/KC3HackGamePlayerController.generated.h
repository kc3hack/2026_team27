// Copyright Epic Games, Inc. All Rights Reserved.
/*===========================================================================
	Generated code exported from UnrealHeaderTool.
	DO NOT modify this manually! Edit the corresponding .h files instead!
===========================================================================*/

// IWYU pragma: private, include "KC3HackGamePlayerController.h"

#ifdef KC3HACKGAME_KC3HackGamePlayerController_generated_h
#error "KC3HackGamePlayerController.generated.h already included, missing '#pragma once' in KC3HackGamePlayerController.h"
#endif
#define KC3HACKGAME_KC3HackGamePlayerController_generated_h

#include "UObject/ObjectMacros.h"
#include "UObject/ScriptMacros.h"

PRAGMA_DISABLE_DEPRECATION_WARNINGS

// ********** Begin Class AKC3HackGamePlayerController *********************************************
KC3HACKGAME_API UClass* Z_Construct_UClass_AKC3HackGamePlayerController_NoRegister();

#define FID_VScodeFiles_GitHub_2026_team27_KC3HackGame_Source_KC3HackGame_KC3HackGamePlayerController_h_19_INCLASS_NO_PURE_DECLS \
private: \
	static void StaticRegisterNativesAKC3HackGamePlayerController(); \
	friend struct Z_Construct_UClass_AKC3HackGamePlayerController_Statics; \
	static UClass* GetPrivateStaticClass(); \
	friend KC3HACKGAME_API UClass* Z_Construct_UClass_AKC3HackGamePlayerController_NoRegister(); \
public: \
	DECLARE_CLASS2(AKC3HackGamePlayerController, APlayerController, COMPILED_IN_FLAGS(CLASS_Abstract | CLASS_Config), CASTCLASS_None, TEXT("/Script/KC3HackGame"), Z_Construct_UClass_AKC3HackGamePlayerController_NoRegister) \
	DECLARE_SERIALIZER(AKC3HackGamePlayerController)


#define FID_VScodeFiles_GitHub_2026_team27_KC3HackGame_Source_KC3HackGame_KC3HackGamePlayerController_h_19_ENHANCED_CONSTRUCTORS \
	/** Standard constructor, called after all reflected properties have been initialized */ \
	NO_API AKC3HackGamePlayerController(const FObjectInitializer& ObjectInitializer = FObjectInitializer::Get()); \
	/** Deleted move- and copy-constructors, should never be used */ \
	AKC3HackGamePlayerController(AKC3HackGamePlayerController&&) = delete; \
	AKC3HackGamePlayerController(const AKC3HackGamePlayerController&) = delete; \
	DECLARE_VTABLE_PTR_HELPER_CTOR(NO_API, AKC3HackGamePlayerController); \
	DEFINE_VTABLE_PTR_HELPER_CTOR_CALLER(AKC3HackGamePlayerController); \
	DEFINE_ABSTRACT_DEFAULT_OBJECT_INITIALIZER_CONSTRUCTOR_CALL(AKC3HackGamePlayerController) \
	NO_API virtual ~AKC3HackGamePlayerController();


#define FID_VScodeFiles_GitHub_2026_team27_KC3HackGame_Source_KC3HackGame_KC3HackGamePlayerController_h_16_PROLOG
#define FID_VScodeFiles_GitHub_2026_team27_KC3HackGame_Source_KC3HackGame_KC3HackGamePlayerController_h_19_GENERATED_BODY \
PRAGMA_DISABLE_DEPRECATION_WARNINGS \
public: \
	FID_VScodeFiles_GitHub_2026_team27_KC3HackGame_Source_KC3HackGame_KC3HackGamePlayerController_h_19_INCLASS_NO_PURE_DECLS \
	FID_VScodeFiles_GitHub_2026_team27_KC3HackGame_Source_KC3HackGame_KC3HackGamePlayerController_h_19_ENHANCED_CONSTRUCTORS \
private: \
PRAGMA_ENABLE_DEPRECATION_WARNINGS


class AKC3HackGamePlayerController;

// ********** End Class AKC3HackGamePlayerController ***********************************************

#undef CURRENT_FILE_ID
#define CURRENT_FILE_ID FID_VScodeFiles_GitHub_2026_team27_KC3HackGame_Source_KC3HackGame_KC3HackGamePlayerController_h

PRAGMA_ENABLE_DEPRECATION_WARNINGS
