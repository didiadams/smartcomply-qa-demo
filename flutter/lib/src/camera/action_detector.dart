import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';

/// Tracks the state of one liveness action.
class ActionState {
  final String action;
  bool detected;
  bool active;
  double confidence;

  ActionState({
    required this.action,
    this.detected = false,
    this.active = false,
    this.confidence = 0,
  });
}

/// Detects and sequences face actions using ML Kit face data.
/// Mirrors ActionDetector.ts — requires [holdFrames] consecutive high-
/// confidence frames before marking an action as completed.
class ActionDetector {
  static const int _holdFrames = 8;
  static const double _threshold = 0.6;

  final List<String> requiredActions;
  final Set<String> _completed = {};
  final Map<String, int> _holdCounters = {};

  ActionDetector(this.requiredActions);

  /// Returns the first action not yet completed, or null if all done.
  String? getCurrentAction() {
    for (final action in requiredActions) {
      if (!_completed.contains(action)) return action;
    }
    return null;
  }

  /// Evaluates [face] (may be null if no face detected) and updates internal
  /// state. Returns current [ActionState] list for UI rendering.
  List<ActionState> check(Face? face) {
    final current = getCurrentAction();

    if (face == null || current == null) {
      return _buildStates(current, 0);
    }

    if (!_completed.contains(current)) {
      final conf = _getConfidence(current, face);

      if (conf > _threshold) {
        final count = (_holdCounters[current] ?? 0) + 1;
        _holdCounters[current] = count;

        if (count >= _holdFrames) {
          _completed.add(current);
          _holdCounters.remove(current);
        }
      } else {
        _holdCounters[current] = 0;
      }

      return _buildStates(current, conf);
    }

    return _buildStates(current, 0);
  }

  bool allCompleted() =>
      requiredActions.every((a) => _completed.contains(a));

  int completedCount() => _completed.length;

  void reset() {
    _completed.clear();
    _holdCounters.clear();
  }

  List<ActionState> _buildStates(String? currentAction, double currentConf) {
    return requiredActions.map((action) {
      return ActionState(
        action: action,
        detected: _completed.contains(action),
        active: action == currentAction,
        confidence: action == currentAction ? currentConf : 0,
      );
    }).toList();
  }

  double _getConfidence(String action, Face face) {
    switch (action) {
      case 'smile':
        return face.smilingProbability ?? 0.0;

      case 'blink':
        final left = 1.0 - (face.leftEyeOpenProbability ?? 1.0);
        final right = 1.0 - (face.rightEyeOpenProbability ?? 1.0);
        return (left + right) / 2;

      case 'close_eyes':
        final left = 1.0 - (face.leftEyeOpenProbability ?? 1.0);
        final right = 1.0 - (face.rightEyeOpenProbability ?? 1.0);
        return left < right ? left : right; // both eyes must be closed

      case 'turn_left':
        // ML Kit headEulerAngleY: negative = left
        final yaw = face.headEulerAngleY ?? 0.0;
        return yaw < -12 ? (yaw.abs() / 30).clamp(0.0, 1.0) : 0.0;

      case 'turn_right':
        final yaw = face.headEulerAngleY ?? 0.0;
        return yaw > 12 ? (yaw / 30).clamp(0.0, 1.0) : 0.0;

      case 'nod':
        // headEulerAngleX: positive = nodding down
        final pitch = face.headEulerAngleX ?? 0.0;
        return pitch > 12 ? (pitch / 25).clamp(0.0, 1.0) : 0.0;

      case 'look_up':
        final pitch = face.headEulerAngleX ?? 0.0;
        return pitch < -12 ? (pitch.abs() / 25).clamp(0.0, 1.0) : 0.0;

      case 'look_down':
        final pitch = face.headEulerAngleX ?? 0.0;
        return pitch > 12 ? (pitch / 25).clamp(0.0, 1.0) : 0.0;

      // Actions not directly supported by ML Kit — return 0 (silently skipped)
      case 'open_mouth':
      case 'raise_eyebrows':
      case 'puff_cheeks':
      case 'pucker_lips':
        return 0.0;

      default:
        return 0.0;
    }
  }
}
