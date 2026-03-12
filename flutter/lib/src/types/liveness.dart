/// Valid challenge actions accepted by the backend.
/// Must be sent UPPERCASE to the API.
enum ChallengeAction {
  blink,
  turnLeft,
  turnRight,
  turnHead,
  openMouth;

  /// Serialises to the UPPERCASE string the API expects.
  String toJson() {
    switch (this) {
      case ChallengeAction.blink:      return 'BLINK';
      case ChallengeAction.turnLeft:   return 'TURN_LEFT';
      case ChallengeAction.turnRight:  return 'TURN_RIGHT';
      case ChallengeAction.turnHead:   return 'TURN_HEAD';
      case ChallengeAction.openMouth:  return 'OPEN_MOUTH';
    }
  }

  static ChallengeAction fromString(String s) {
    switch (s.toUpperCase()) {
      case 'BLINK':      return ChallengeAction.blink;
      case 'TURN_LEFT':  return ChallengeAction.turnLeft;
      case 'TURN_RIGHT': return ChallengeAction.turnRight;
      case 'TURN_HEAD':  return ChallengeAction.turnHead;
      case 'OPEN_MOUTH': return ChallengeAction.openMouth;
      default: return ChallengeAction.blink;
    }
  }
}

/// Response from `POST /v1/liveness/create`.
class LivenessCreateResponse {
  final int id;           // LivenessEntry PK — needed for submit
  final String status;    // "pending"
  final String? clientId;

  const LivenessCreateResponse({
    required this.id,
    required this.status,
    this.clientId,
  });

  factory LivenessCreateResponse.fromJson(Map<String, dynamic> json) {
    final data = json['data'] as Map<String, dynamic>? ?? json;
    return LivenessCreateResponse(
      id: data['id'] as int,
      status: data['status'] as String? ?? 'pending',
      clientId: data['client_id'] as String?,
    );
  }
}

/// Response from `POST /v1/liveness/submit`.
class LivenessSubmitResponse {
  final String status;         // "success"
  final String message;
  final String? livenessStatus; // "pending" | "passed" | "failed" | "processing"
  final String? verifiedAt;
  final String? failureReason;
  final List<String>? challengeActions;
  final String? videoUrl;

  const LivenessSubmitResponse({
    required this.status,
    required this.message,
    this.livenessStatus,
    this.verifiedAt,
    this.failureReason,
    this.challengeActions,
    this.videoUrl,
  });

  bool get isSuccess => status == 'success';

  factory LivenessSubmitResponse.fromJson(Map<String, dynamic> json) {
    final data = json['data'] as Map<String, dynamic>? ?? {};
    return LivenessSubmitResponse(
      status: json['status'] as String? ?? 'failed',
      message: json['message'] as String? ?? '',
      livenessStatus: data['status'] as String?,
      verifiedAt: data['verified_at'] as String?,
      failureReason: data['failure_reason'] as String?,
      challengeActions: data['challenge_actions'] != null
          ? List<String>.from(data['challenge_actions'] as List)
          : null,
      videoUrl: data['video_url'] as String?,
    );
  }
}

/// SDK config returned from `GET /v1/sdk/initialize`.
class SDKInitializeResponse {
  final String brandName;
  final String description;
  final String theme;
  final String? redirectUrl;
  final Map<String, dynamic>? channels;

  const SDKInitializeResponse({
    required this.brandName,
    required this.description,
    required this.theme,
    this.redirectUrl,
    this.channels,
  });

  factory SDKInitializeResponse.fromJson(Map<String, dynamic> json) {
    final data = json['data'] as Map<String, dynamic>? ?? json;
    return SDKInitializeResponse(
      brandName: data['brand_name'] as String? ?? '',
      description: data['description'] as String? ?? '',
      theme: data['theme'] as String? ?? 'default',
      redirectUrl: data['redirect_url'] as String?,
      channels: data['channels'] as Map<String, dynamic>?,
    );
  }
}
