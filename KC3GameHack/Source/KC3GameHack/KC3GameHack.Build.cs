// Copyright Epic Games, Inc. All Rights Reserved.

using UnrealBuildTool;

public class KC3GameHack : ModuleRules
{
	public KC3GameHack(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[] {
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"EnhancedInput",
			"AIModule",
			"StateTreeModule",
			"GameplayStateTreeModule",
			"UMG",
			"Slate",
            "AudioMixer", 
			"SignalProcessing",
			"WebSockets"
        });

		PrivateDependencyModuleNames.AddRange(new string[] { });

		PublicIncludePaths.AddRange(new string[] {
			"KC3GameHack",
			"KC3GameHack/Variant_Platforming",
			"KC3GameHack/Variant_Platforming/Animation",
			"KC3GameHack/Variant_Combat",
			"KC3GameHack/Variant_Combat/AI",
			"KC3GameHack/Variant_Combat/Animation",
			"KC3GameHack/Variant_Combat/Gameplay",
			"KC3GameHack/Variant_Combat/Interfaces",
			"KC3GameHack/Variant_Combat/UI",
			"KC3GameHack/Variant_SideScrolling",
			"KC3GameHack/Variant_SideScrolling/AI",
			"KC3GameHack/Variant_SideScrolling/Gameplay",
			"KC3GameHack/Variant_SideScrolling/Interfaces",
			"KC3GameHack/Variant_SideScrolling/UI"
		});

		// Uncomment if you are using Slate UI
		// PrivateDependencyModuleNames.AddRange(new string[] { "Slate", "SlateCore" });

		// Uncomment if you are using online features
		// PrivateDependencyModuleNames.Add("OnlineSubsystem");

		// To include OnlineSubsystemSteam, add it to the plugins section in your uproject file with the Enabled attribute set to true
	}
}
