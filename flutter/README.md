# SmartComply Flutter SDK

A Flutter package for SmartComply identity verification and liveness detection.
This package is the native Flutter port of the [SmartComply Web SDK](https://github.com/Anitajallas/smartcomply-web-sdk).

## Features

- **Session management** — create and track verification sessions
- **Identity onboarding** — verify BVN, NIN, Driver's License, Voter's Card, and Passport
- **Liveness detection** — camera-based face action challenges with ML Kit face detection
- **One-call liveness flow** — `liveness.startCheck(context)` handles camera, detection, recording, and API submission

## Installation

In your app's `pubspec.yaml`:

```yaml
dependencies:
  smartcomply_sdk: ^0.1.0
```

## Platform Setup

### Android

In `android/app/src/main/AndroidManifest.xml`, add:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.INTERNET" />
```

Set minimum SDK version in `android/app/build.gradle`:

```groovy
android {
    defaultConfig {
        minSdk 21
    }
}
```

### iOS

In `ios/Runner/Info.plist`, add:

```xml
<key>NSCameraUsageDescription</key>
<string>Camera is needed for liveness verification.</string>
```

## Quick Start

```dart
import 'package:smartcomply_sdk/smartcomply_sdk.dart';

// 1. Initialise
final sdk = SmartComply(SDKConfig(
  apiKey: 'pk_live_your_key',
  environment: Environment.production,
));

// 2. Create a session
await sdk.createSession();

// 3. Verify identity
final identity = await sdk.startOnboarding(
  onboardingType: OnboardingType.bvn,
  idNumber: '22012345678',
  nameToConfirm: 'Amara Okafor',
);

// 4. Run liveness check (opens camera, guides user, submits video)
if (identity.isVerified) {
  final liveness = await sdk.liveness.startCheck(
    context,
    actions: ['smile', 'blink'],
  );
  print('Liveness: ${liveness.status}');
}
```

## API Reference

### `SmartComply`
| Method | Description |
|---|---|
| `createSession()` | Creates a new verification session |
| `startOnboarding({...})` | Creates session (if needed) + verifies identity |
| `onboarding` | Access to `OnboardingModule` |
| `liveness` | Access to `LivenessModule` |

### `OnboardingModule`
| Method | Description |
|---|---|
| `verify({onboardingType, idNumber, nameToConfirm})` | Verify identity |
| `status()` | Get session status |
| `result()` | Get final onboarding result |

### `LivenessModule`
| Method | Description |
|---|---|
| `start({actions?})` | Get a challenge from the backend |
| `verify({challengeId, videoFile})` | Submit recorded video |
| `startCheck(context, {actions?})` | Full-screen all-in-one flow |

## Supported Liveness Actions

| Action | Detection method |
|---|---|
| `smile` | ML Kit `smilingProbability` |
| `blink` | ML Kit `leftEyeOpenProbability` / `rightEyeOpenProbability` |
| `close_eyes` | ML Kit eye open probabilities |
| `turn_left` / `turn_right` | ML Kit `headEulerAngleY` |
| `nod` / `look_up` / `look_down` | ML Kit `headEulerAngleX` |

## Directory Structure

```
flutter/
├── lib/
│   ├── smartcomply_sdk.dart          # Barrel export
│   └── src/
│       ├── client/
│       │   ├── config.dart           # SDKConfig, Environment
│       │   ├── http_client.dart      # HTTP + multipart upload
│       │   └── smartcomply.dart      # Main SDK class
│       ├── camera/
│       │   └── action_detector.dart  # ML Kit action detection logic
│       ├── modules/
│       │   ├── onboarding/
│       │   │   └── onboarding_module.dart
│       │   └── liveness/
│       │       ├── liveness_module.dart
│       │       └── liveness_widget.dart  # Camera UI widget
│       ├── types/
│       │   ├── onboarding.dart
│       │   └── liveness.dart
│       └── errors/
│           └── sdk_error.dart
└── example/
    └── lib/main.dart                 # Demo app
```
