import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';

import '../../client/http_client.dart';
import '../../types/liveness.dart';
import 'liveness_widget.dart';

/// Handles liveness-check API calls and launching the camera widget.
/// Mirrors the TypeScript `LivenessModule` class.
class LivenessModule {
  final HttpClient _http;
  String? _sessionId;

  LivenessModule(this._http);

  void setSessionId(String sessionId) => _sessionId = sessionId;

  String _requireSession() {
    if (_sessionId == null) {
      throw StateError(
        'No active session. Call sdk.createSession() before using liveness methods.',
      );
    }
    return _sessionId!;
  }

  /// Requests a liveness challenge from the backend.
  /// Pass [actions] to request specific actions; omit to let the server decide.
  Future<LivenessChallengeResponse> start({List<String>? actions}) {
    final sessionId = _requireSession();
    return _http.request<LivenessChallengeResponse>(
      'POST',
      '/v1/liveness/start',
      body: {
        'session_id': sessionId,
        if (actions != null && actions.isNotEmpty) 'actions': actions,
      },
      fromJson: LivenessChallengeResponse.fromJson,
    );
  }

  /// Submits the recorded [videoFile] for server-side verification.
  Future<LivenessVerifyResponse> verify({
    required String challengeId,
    required File videoFile,
  }) {
    return _http.upload<LivenessVerifyResponse>(
      '/v1/liveness/verify',
      challengeId: challengeId,
      videoFile: videoFile,
      fromJson: LivenessVerifyResponse.fromJson,
    );
  }

  /// **All-in-one convenience method** — equivalent to `startCheck()` in the
  /// TypeScript SDK.
  ///
  /// Pushes a full-screen [LivenessCheckWidget] onto the navigator, waits for
  /// the user to complete all face actions, records video, then submits it to
  /// the backend and returns the [LivenessVerifyResponse].
  ///
  /// ```dart
  /// final result = await sdk.liveness.startCheck(
  ///   context,
  ///   actions: ['smile', 'blink'],
  /// );
  /// ```
  Future<LivenessVerifyResponse> startCheck(
    BuildContext context, {
    List<String>? actions,
  }) async {
    _requireSession();

    // 1. Get challenge from backend
    final challenge = await start(actions: actions);

    // 2. Push the camera widget and wait for completion
    final completer = Completer<(File, String)>();

    if (!context.mounted) {
      throw StateError('BuildContext is no longer mounted.');
    }

    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => LivenessCheckWidget(
          challenge: challenge,
          onComplete: (videoFile, challengeId) {
            if (!completer.isCompleted) {
              completer.complete((videoFile, challengeId));
            }
            Navigator.of(context).pop();
          },
          onTimeout: () {
            // Widget will still call onComplete with whatever video was recorded
          },
        ),
      ),
    );

    // 3. Get the recorded video
    final (videoFile, challengeId) = await completer.future;

    // 4. Submit to backend
    return verify(challengeId: challengeId, videoFile: videoFile);
  }
}
