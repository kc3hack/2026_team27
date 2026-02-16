// Copyright Epic Games, Inc. All Rights Reserved.
/*===========================================================================
	Generated code exported from UnrealHeaderTool.
	DO NOT modify this manually! Edit the corresponding .h files instead!
===========================================================================*/

// IWYU pragma: private, include "KC3HackGameCharacter.h"

#ifdef KC3HACKGAME_KC3HackGameCharacter_generated_h
#error "KC3HackGameCharacter.generated.h already included, missing '#pragma once' in KC3HackGameCharacter.h"
#endif
#define KC3HACKGAME_KC3HackGameCharacter_generated_h

#include "UObject/ObjectMacros.h"
#include "UObject/ScriptMacros.h"

PRAGMA_DISABLE_DEPRECATION_WARNINGS

// ********** Begin Class AKC3HackGameCharacter ****************************************************
#define FID_VScodeFiles_GitHub_2026_team27_KC3HackGame_Source_KC3HackGame_KC3HackGameCharacter_h_24_RPC_WRAPPERS_NO_PURE_DECLS \
	DECLARE_FUNCTION(execDoJumpEnd); \
	DECLARE_FUNCTION(execDoJumpStart); \
	DECLARE_FUNCTION(execDoLook); \
	DECLARE_FUNCTION(execDoMove);


KC3HACKGAME_API UClass* Z_Construct_UClass_AKC3HackGameCharacter_NoRegister();

#define FID_VScodeFiles_GitHub_2026_team27_KC3HackGame_Source_KC3HackGame_KC3HackGameCharacter_h_24_INCLASS_NO_PURE_DECLS \
private: \
	static void StaticRegisterNativesAKC3HackGameCharacter(); \
	friend struct Z_Construct_UClass_AKC3HackGameCharacter_Statics; \
	static UClass* GetPrivateStaticClass(); \
	friend KC3HACKGAME_API UClass* Z_Construct_UClass_AKC3HackGameCharacter_NoRegister(); \
public: \
	DECLARE_CLASS2(AKC3HackGameCharacter, ACharacter, COMPILED_IN_FLAGS(CLASS_Abstract | CLASS_Config), CASTCLASS_None, TEXT("/Script/KC3HackGame"), Z_Construct_UClass_AKC3HackGameCharacter_NoRegister) \
	DECLARE_SERIALIZER(AKC3HackGameCharacter)


#define FID_VScodeFiles_GitHub_2026_team27_KC3HackGame_Source_KC3HackGame_KC3HackGameCharacter_h_24_ENHANCED_CONSTRUCTORS \
	/** Deleted move- and copy-constructors, should never be used */ \
	AKC3HackGameCharacter(AKC3HackGameCharacter&&) = delete; \
	AKC3HackGameCharacter(const AKC3HackGameCharacter&) = delete; \
	DECLARE_VTABLE_PTR_HELPER_CTOR(NO_API, AKC3HackGameCharacter); \
	DEFINE_VTABLE_PTR_HELPER_CTOR_CALLER(AKC3HackGameCharacter); \
	DEFINE_ABSTRACT_DEFAULT_CONSTRUCTOR_CALL(AKC3HackGameCharacter) \
	NO_API virtual ~AKC3HackGameCharacter();


#define FID_VScodeFiles_GitHub_2026_team27_KC3HackGame_Source_KC3HackGame_KC3HackGameCharacter_h_21_PROLOG
#define FID_VScodeFiles_GitHub_2026_team27_KC3HackGame_Source_KC3HackGame_KC3HackGameCharacter_h_24_GENERATED_BODY \
PRAGMA_DISABLE_DEPRECATION_WARNINGS \
public: \
	FID_VScodeFiles_GitHub_2026_team27_KC3HackGame_Source_KC3HackGame_KC3HackGameCharacter_h_24_RPC_WRAPPERS_NO_PURE_DECLS \
	FID_VScodeFiles_GitHub_2026_team27_KC3HackGame_Source_KC3HackGame_KC3HackGameCharacter_h_24_INCLASS_NO_PURE_DECLS \
	FID_VScodeFiles_GitHub_2026_team27_KC3HackGame_Source_KC3HackGame_KC3HackGameCharacter_h_24_ENHANCED_CONSTRUCTORS \
private: \
PRAGMA_ENABLE_DEPRECATION_WARNINGS


class AKC3HackGameCharacter;

// ********** End Class AKC3HackGameCharacter ******************************************************

#undef CURRENT_FILE_ID
#define CURRENT_FILE_ID FID_VScodeFiles_GitHub_2026_team27_KC3HackGame_Source_KC3HackGame_KC3HackGameCharacter_h

PRAGMA_ENABLE_DEPRECATION_WARNINGS
