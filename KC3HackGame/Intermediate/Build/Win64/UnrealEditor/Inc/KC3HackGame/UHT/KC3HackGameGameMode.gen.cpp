// Copyright Epic Games, Inc. All Rights Reserved.
/*===========================================================================
	Generated code exported from UnrealHeaderTool.
	DO NOT modify this manually! Edit the corresponding .h files instead!
===========================================================================*/

#include "UObject/GeneratedCppIncludes.h"
#include "KC3HackGameGameMode.h"

PRAGMA_DISABLE_DEPRECATION_WARNINGS

void EmptyLinkFunctionForGeneratedCodeKC3HackGameGameMode() {}

// ********** Begin Cross Module References ********************************************************
ENGINE_API UClass* Z_Construct_UClass_AGameModeBase();
KC3HACKGAME_API UClass* Z_Construct_UClass_AKC3HackGameGameMode();
KC3HACKGAME_API UClass* Z_Construct_UClass_AKC3HackGameGameMode_NoRegister();
UPackage* Z_Construct_UPackage__Script_KC3HackGame();
// ********** End Cross Module References **********************************************************

// ********** Begin Class AKC3HackGameGameMode *****************************************************
void AKC3HackGameGameMode::StaticRegisterNativesAKC3HackGameGameMode()
{
}
FClassRegistrationInfo Z_Registration_Info_UClass_AKC3HackGameGameMode;
UClass* AKC3HackGameGameMode::GetPrivateStaticClass()
{
	using TClass = AKC3HackGameGameMode;
	if (!Z_Registration_Info_UClass_AKC3HackGameGameMode.InnerSingleton)
	{
		GetPrivateStaticClassBody(
			StaticPackage(),
			TEXT("KC3HackGameGameMode"),
			Z_Registration_Info_UClass_AKC3HackGameGameMode.InnerSingleton,
			StaticRegisterNativesAKC3HackGameGameMode,
			sizeof(TClass),
			alignof(TClass),
			TClass::StaticClassFlags,
			TClass::StaticClassCastFlags(),
			TClass::StaticConfigName(),
			(UClass::ClassConstructorType)InternalConstructor<TClass>,
			(UClass::ClassVTableHelperCtorCallerType)InternalVTableHelperCtorCaller<TClass>,
			UOBJECT_CPPCLASS_STATICFUNCTIONS_FORCLASS(TClass),
			&TClass::Super::StaticClass,
			&TClass::WithinClass::StaticClass
		);
	}
	return Z_Registration_Info_UClass_AKC3HackGameGameMode.InnerSingleton;
}
UClass* Z_Construct_UClass_AKC3HackGameGameMode_NoRegister()
{
	return AKC3HackGameGameMode::GetPrivateStaticClass();
}
struct Z_Construct_UClass_AKC3HackGameGameMode_Statics
{
#if WITH_METADATA
	static constexpr UECodeGen_Private::FMetaDataPairParam Class_MetaDataParams[] = {
#if !UE_BUILD_SHIPPING
		{ "Comment", "/**\n *  Simple GameMode for a third person game\n */" },
#endif
		{ "HideCategories", "Info Rendering MovementReplication Replication Actor Input Movement Collision Rendering HLOD WorldPartition DataLayers Transformation" },
		{ "IncludePath", "KC3HackGameGameMode.h" },
		{ "ModuleRelativePath", "KC3HackGameGameMode.h" },
		{ "ShowCategories", "Input|MouseInput Input|TouchInput" },
#if !UE_BUILD_SHIPPING
		{ "ToolTip", "Simple GameMode for a third person game" },
#endif
	};
#endif // WITH_METADATA
	static UObject* (*const DependentSingletons[])();
	static constexpr FCppClassTypeInfoStatic StaticCppClassTypeInfo = {
		TCppClassTypeTraits<AKC3HackGameGameMode>::IsAbstract,
	};
	static const UECodeGen_Private::FClassParams ClassParams;
};
UObject* (*const Z_Construct_UClass_AKC3HackGameGameMode_Statics::DependentSingletons[])() = {
	(UObject* (*)())Z_Construct_UClass_AGameModeBase,
	(UObject* (*)())Z_Construct_UPackage__Script_KC3HackGame,
};
static_assert(UE_ARRAY_COUNT(Z_Construct_UClass_AKC3HackGameGameMode_Statics::DependentSingletons) < 16);
const UECodeGen_Private::FClassParams Z_Construct_UClass_AKC3HackGameGameMode_Statics::ClassParams = {
	&AKC3HackGameGameMode::StaticClass,
	"Game",
	&StaticCppClassTypeInfo,
	DependentSingletons,
	nullptr,
	nullptr,
	nullptr,
	UE_ARRAY_COUNT(DependentSingletons),
	0,
	0,
	0,
	0x008003ADu,
	METADATA_PARAMS(UE_ARRAY_COUNT(Z_Construct_UClass_AKC3HackGameGameMode_Statics::Class_MetaDataParams), Z_Construct_UClass_AKC3HackGameGameMode_Statics::Class_MetaDataParams)
};
UClass* Z_Construct_UClass_AKC3HackGameGameMode()
{
	if (!Z_Registration_Info_UClass_AKC3HackGameGameMode.OuterSingleton)
	{
		UECodeGen_Private::ConstructUClass(Z_Registration_Info_UClass_AKC3HackGameGameMode.OuterSingleton, Z_Construct_UClass_AKC3HackGameGameMode_Statics::ClassParams);
	}
	return Z_Registration_Info_UClass_AKC3HackGameGameMode.OuterSingleton;
}
DEFINE_VTABLE_PTR_HELPER_CTOR(AKC3HackGameGameMode);
AKC3HackGameGameMode::~AKC3HackGameGameMode() {}
// ********** End Class AKC3HackGameGameMode *******************************************************

// ********** Begin Registration *******************************************************************
struct Z_CompiledInDeferFile_FID_VScodeFiles_GitHub_2026_team27_KC3HackGame_Source_KC3HackGame_KC3HackGameGameMode_h__Script_KC3HackGame_Statics
{
	static constexpr FClassRegisterCompiledInInfo ClassInfo[] = {
		{ Z_Construct_UClass_AKC3HackGameGameMode, AKC3HackGameGameMode::StaticClass, TEXT("AKC3HackGameGameMode"), &Z_Registration_Info_UClass_AKC3HackGameGameMode, CONSTRUCT_RELOAD_VERSION_INFO(FClassReloadVersionInfo, sizeof(AKC3HackGameGameMode), 2431819817U) },
	};
};
static FRegisterCompiledInInfo Z_CompiledInDeferFile_FID_VScodeFiles_GitHub_2026_team27_KC3HackGame_Source_KC3HackGame_KC3HackGameGameMode_h__Script_KC3HackGame_2513877780(TEXT("/Script/KC3HackGame"),
	Z_CompiledInDeferFile_FID_VScodeFiles_GitHub_2026_team27_KC3HackGame_Source_KC3HackGame_KC3HackGameGameMode_h__Script_KC3HackGame_Statics::ClassInfo, UE_ARRAY_COUNT(Z_CompiledInDeferFile_FID_VScodeFiles_GitHub_2026_team27_KC3HackGame_Source_KC3HackGame_KC3HackGameGameMode_h__Script_KC3HackGame_Statics::ClassInfo),
	nullptr, 0,
	nullptr, 0);
// ********** End Registration *********************************************************************

PRAGMA_ENABLE_DEPRECATION_WARNINGS
