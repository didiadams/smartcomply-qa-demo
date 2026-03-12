import 'dart:async';
import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import 'package:path_provider/path_provider.dart';

import '../../camera/action_detector.dart';
import '../../types/liveness.dart';

/// Callback invoked when the liveness capture finishes.
/// [autoshotFile]: a still JPEG frame captured at the start.
/// [videoFile]: the recorded session video.
typedef LivenessCompleteCallback = void Function(
  File autoshotFile,
  File videoFile,
);

/// Full-screen Flutter widget that:
/// 1. Opens the front camera
/// 2. Captures an autoshot (still frame) — required by /v1/liveness/create
/// 3. Streams frames through ML Kit face detection
/// 4. Guides the user through sequential [challengeActions] (BLINK, TURN_LEFT, etc.)
/// 5. Records the session video — required by /v1/liveness/submit
/// 6. Calls [onComplete] with both files
class LivenessCheckWidget extends StatefulWidget {
  final List<ChallengeAction> challengeActions;
  final LivenessCompleteCallback onComplete;
  final VoidCallback? onTimeout;
  final int timeLimitSeconds;

  const LivenessCheckWidget({
    super.key,
    required this.challengeActions,
    required this.onComplete,
    this.onTimeout,
    this.timeLimitSeconds = 45,
  });

  @override
  State<LivenessCheckWidget> createState() => _LivenessCheckWidgetState();
}

class _LivenessCheckWidgetState extends State<LivenessCheckWidget> {
  CameraController? _cameraController;
  bool _cameraReady = false;

  final FaceDetector _faceDetector = FaceDetector(
    options: FaceDetectorOptions(
      enableClassification: true,
      enableTracking: false,
      performanceMode: FaceDetectorMode.fast,
    ),
  );
  bool _isDetecting = false;

  late ActionDetector _actionDetector;
  List<ActionState> _actionStates = [];
  String _instruction = 'Position your face in the oval';

  late int _remaining;
  Timer? _countdownTimer;

  bool _completed = false;
  bool _autoshotCaptured = false;
  File? _autoshotFile;

  String? _error;

  @override
  void initState() {
    super.initState();
    _actionDetector = ActionDetector(widget.challengeActions);
    _actionStates = widget.challengeActions
        .map((a) => ActionState(action: a))
        .toList();
    _remaining = widget.timeLimitSeconds;
    _initCamera();
  }

  Future<void> _initCamera() async {
    final cameras = await availableCameras();
    final front = cameras.firstWhere(
      (c) => c.lensDirection == CameraLensDirection.front,
      orElse: () => cameras.first,
    );

    _cameraController = CameraController(
      front,
      ResolutionPreset.medium,
      enableAudio: false,
      imageFormatGroup: Platform.isAndroid
          ? ImageFormatGroup.nv21
          : ImageFormatGroup.bgra8888,
    );

    try {
      await _cameraController!.initialize();
      if (!mounted) return;
      setState(() => _cameraReady = true);
      _startCountdown();
      await _cameraController!.startVideoRecording();
      _cameraController!.startImageStream(_onFrame);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  void _startCountdown() {
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _remaining--);
      if (_remaining <= 0 && !_completed) {
        _countdownTimer?.cancel();
        _finishCapture();
      }
    });
  }

  Future<void> _onFrame(CameraImage image) async {
    if (_isDetecting || _completed) return;
    _isDetecting = true;

    try {
      // Capture autoshot from first valid frame
      if (!_autoshotCaptured) {
        await _captureAutoshot();
      }

      final inputImage = _cameraImageToInputImage(image);
      if (inputImage == null) return;

      final faces = await _faceDetector.processImage(inputImage);
      final face = faces.isNotEmpty ? faces.first : null;
      final states = _actionDetector.check(face);

      if (!mounted) return;
      setState(() {
        _actionStates = states;
        final current = _actionDetector.getCurrentAction();
        if (face == null) {
          _instruction = 'Position your face in the oval';
        } else if (current != null) {
          _instruction = _describeAction(current);
        } else {
          _instruction = 'All done!';
        }
      });

      if (_actionDetector.allCompleted() && !_completed) {
        _completed = true;
        await _finishCapture();
      }
    } finally {
      _isDetecting = false;
    }
  }

  Future<void> _captureAutoshot() async {
    _autoshotCaptured = true; // set first to avoid re-entry
    try {
      final xfile = await _cameraController?.takePicture();
      if (xfile != null) _autoshotFile = File(xfile.path);
    } catch (_) {
      // If takePicture fails during stream, create a placeholder
      final tmp = await getTemporaryDirectory();
      _autoshotFile = File('${tmp.path}/autoshot_placeholder.jpg')
        ..createSync();
    }
  }

  InputImage? _cameraImageToInputImage(CameraImage image) {
    final camera = _cameraController?.description;
    if (camera == null) return null;
    final rotation = InputImageRotationValue.fromRawValue(
          camera.sensorOrientation,
        ) ??
        InputImageRotation.rotation0deg;
    final format = InputImageFormatValue.fromRawValue(image.format.raw);
    if (format == null) return null;
    final plane = image.planes.first;
    return InputImage.fromBytes(
      bytes: plane.bytes,
      metadata: InputImageMetadata(
        size: Size(image.width.toDouble(), image.height.toDouble()),
        rotation: rotation,
        format: format,
        bytesPerRow: plane.bytesPerRow,
      ),
    );
  }

  Future<void> _finishCapture() async {
    _countdownTimer?.cancel();
    await _cameraController?.stopImageStream();

    File videoFile;
    try {
      final xfile = await _cameraController?.stopVideoRecording();
      videoFile = xfile != null
          ? File(xfile.path)
          : await _fallbackFile('video.mp4');
    } catch (_) {
      videoFile = await _fallbackFile('video.mp4');
    }

    final autoshotFile = _autoshotFile ?? await _fallbackFile('autoshot.jpg');

    if (widget.timeLimitSeconds > 0 && _remaining <= 0) {
      widget.onTimeout?.call();
    }

    widget.onComplete(autoshotFile, videoFile);
  }

  Future<File> _fallbackFile(String name) async {
    final tmp = await getTemporaryDirectory();
    final f = File('${tmp.path}/$name');
    await f.create();
    return f;
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _faceDetector.close();
    _cameraController?.dispose();
    super.dispose();
  }

  // ── UI ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Scaffold(
        backgroundColor: const Color(0xFF0A0A0A),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text('Camera error: $_error',
                style: const TextStyle(color: Colors.white70),
                textAlign: TextAlign.center),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0A),
      body: SafeArea(
        child: Stack(
          children: [
            if (_cameraReady && _cameraController != null)
              Positioned.fill(
                child: Transform(
                  alignment: Alignment.center,
                  transform: Matrix4.identity()..scale(-1.0, 1.0),
                  child: CameraPreview(_cameraController!),
                ),
              ),
            Positioned.fill(child: _buildOvalGuide()),
            Positioned(top: 0, left: 0, right: 0, child: _buildTopBar()),
            Positioned(bottom: 0, left: 0, right: 0, child: _buildBottomPanel()),
            if (!_cameraReady)
              Positioned.fill(
                child: Container(
                  color: const Color(0xFF0A0A0A),
                  child: const Center(
                      child: CircularProgressIndicator(color: Colors.white)),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildOvalGuide() {
    final conf = _actionStates
        .where((s) => s.active && !s.detected)
        .fold(0.0, (_, s) => s.confidence);
    return CustomPaint(painter: _OvalGuidePainter(activeConfidence: conf));
  }

  Widget _buildTopBar() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xB3000000), Colors.transparent],
        ),
      ),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      child: Text(
        _instruction,
        textAlign: TextAlign.center,
        style: const TextStyle(
            color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600),
      ),
    );
  }

  Widget _buildBottomPanel() {
    final total = _actionStates.length;
    final done = _actionStates.where((s) => s.detected).length;
    final progress = total > 0 ? done / total : 0.0;
    final min = _remaining ~/ 60;
    final sec = _remaining % 60;
    final timerText =
        min > 0 ? '$min:${sec.toString().padLeft(2, '0')}' : '${_remaining}s';

    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: [Color(0xD9000000), Color(0x99000000), Colors.transparent],
          stops: [0, 0.6, 1],
        ),
      ),
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: LinearProgressIndicator(
              value: progress,
              backgroundColor: Colors.white24,
              valueColor: const AlwaysStoppedAnimation(Color(0xFF22C55E)),
              minHeight: 3,
            ),
          ),
          const SizedBox(height: 14),
          ..._actionStates.map(_buildStep),
          const SizedBox(height: 12),
          Text(
            '$timerText remaining',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: _remaining <= 5 ? const Color(0xFFEF4444) : Colors.white54,
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStep(ActionState state) {
    final idx = _actionStates.indexOf(state);
    Color bg = Colors.white.withOpacity(0.06);
    Color borderColor = Colors.white24;
    Color numBg = Colors.white.withOpacity(0.12);
    double opacity = 0.4;
    Widget numChild = Text('${idx + 1}',
        style: const TextStyle(
            color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700));

    if (state.detected) {
      bg = const Color(0xFF22C55E).withOpacity(0.15);
      borderColor = const Color(0xFF22C55E);
      numBg = const Color(0xFF22C55E);
      opacity = 1.0;
      numChild = const Icon(Icons.check, color: Colors.white, size: 16);
    } else if (state.active) {
      bg = const Color(0xFF3B82F6).withOpacity(0.15);
      borderColor = const Color(0xFF3B82F6);
      numBg = const Color(0xFF3B82F6).withOpacity(0.3);
      opacity = 1.0;
    }

    return Opacity(
      opacity: opacity,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration:
            BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
        child: Row(
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                  color: numBg,
                  shape: BoxShape.circle,
                  border: Border.all(color: borderColor, width: 2)),
              child: Center(child: numChild),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(_describeAction(state.action),
                  style: const TextStyle(color: Colors.white, fontSize: 13)),
            ),
            Text(_actionIcon(state.action),
                style: const TextStyle(fontSize: 18)),
          ],
        ),
      ),
    );
  }

  String _describeAction(ChallengeAction a) {
    switch (a) {
      case ChallengeAction.blink:     return 'Blink your eyes';
      case ChallengeAction.turnLeft:  return 'Turn your head left';
      case ChallengeAction.turnRight: return 'Turn your head right';
      case ChallengeAction.turnHead:  return 'Turn your head';
      case ChallengeAction.openMouth: return 'Open your mouth wide';
    }
  }

  String _actionIcon(ChallengeAction a) {
    switch (a) {
      case ChallengeAction.blink:     return '😉';
      case ChallengeAction.turnLeft:  return '⬅';
      case ChallengeAction.turnRight: return '➡';
      case ChallengeAction.turnHead:  return '↔';
      case ChallengeAction.openMouth: return '😮';
    }
  }
}

class _OvalGuidePainter extends CustomPainter {
  final double activeConfidence;
  const _OvalGuidePainter({this.activeConfidence = 0});

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Rect.fromCenter(
      center: Offset(size.width / 2, size.height * 0.38),
      width: size.width * 0.76,
      height: size.height * 0.64,
    );
    canvas.drawOval(
        rect,
        Paint()
          ..color = Colors.white.withOpacity(0.25)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.5);

    if (activeConfidence > 0) {
      canvas.drawArc(
          rect,
          -3.14159 / 2,
          2 * 3.14159 * activeConfidence,
          false,
          Paint()
            ..color = activeConfidence > 0.6
                ? const Color(0xFF22C55E)
                : const Color(0xFF3B82F6)
            ..style = PaintingStyle.stroke
            ..strokeWidth = 3.5
            ..strokeCap = StrokeCap.round);
    }
  }

  @override
  bool shouldRepaint(_OvalGuidePainter o) =>
      o.activeConfidence != activeConfidence;
}
