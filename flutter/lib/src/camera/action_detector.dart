import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import '../types/liveness.dart';

/// Tracks the state of one liveness action.
class ActionState {
  final ChallengeAction action;
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
/// Requires [_holdFrames] consecutive high-confidence frames before
/// marking an action as completed.
class ActionDetector {
  static const int _holdFrames = 8;
  static const double _threshold = 0.6;

  final List<ChallengeAction> requiredActions;
  final Set<ChallengeAction> _completed = {};
  final Map<ChallengeAction, int> _holdCounters = {};

  ActionDetector(this.requiredActions);

  ChallengeAction? getCurrentAction() {
    for (final action in requiredActions) {
      if (!_completed.contains(action)) return action;
    }
    return null;
  }

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

  void reset() {
    _completed.clear();
    _holdCounters.clear();
  }

  List<ActionState> _buildStates(ChallengeAction? current, double conf) {
    return requiredActions.map((a) => ActionState(
          action: a,
          detected: _completed.contains(a),
          active: a == current,
          confidence: a == current ? conf : 0,
        )).toList();
  }

  double _getConfidence(ChallengeAction action, Face face) {
    switch (action) {
      case ChallengeAction.blink:
        final l = 1.0 - (face.leftEyeOpenProbability ?? 1.0);
        final r = 1.0 - (face.rightEyeOpenProbability ?? 1.0);
        return (l + r) / 2;

      case ChallengeAction.turnLeft:
        final yaw = face.headEulerAngleY ?? 0.0;
        return yaw < -12 ? (yaw.abs() / 30).clamp(0.0, 1.0) : 0.0;

      case ChallengeAction.turnRight:
        final yaw = face.headEulerAngleY ?? 0.0;
        return yaw > 12 ? (yaw / 30).clamp(0.0, 1.0) : 0.0;

      case ChallengeAction.turnHead:
        // Accept either a left or right turn
        final yaw = (face.headEulerAngleY ?? 0.0).abs();
        return yaw > 12 ? (yaw / 30).clamp(0.0, 1.0) : 0.0;

      case ChallengeAction.openMouth:
        // ML Kit doesn't expose jawOpen — use a rough heuristic via smile
        // (confidence will be low; backend is the true arbiter via video)
        return face.smilingProbability ?? 0.0;
    }
  }
}
