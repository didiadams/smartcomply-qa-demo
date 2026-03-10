import 'package:flutter/material.dart';
import 'package:smartcomply_sdk/smartcomply_sdk.dart';

void main() => runApp(const SmartComplyExampleApp());

class SmartComplyExampleApp extends StatelessWidget {
  const SmartComplyExampleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SmartComply SDK Demo',
      theme: ThemeData.dark(useMaterial3: true),
      home: const DemoPage(),
    );
  }
}

class DemoPage extends StatefulWidget {
  const DemoPage({super.key});

  @override
  State<DemoPage> createState() => _DemoPageState();
}

class _DemoPageState extends State<DemoPage> {
  // ── Configure the SDK ─────────────────────────────────────────────────────
  final SmartComply _sdk = SmartComply(
    SDKConfig(
      apiKey: 'pk_test_YOUR_KEY_HERE',
      environment: Environment.sandbox,
    ),
  );

  String _log = 'Tap a button to start.';
  bool _busy = false;

  void _append(String msg) {
    setState(() => _log = '$_log\n$msg');
  }

  // ── Step 1: Create session ────────────────────────────────────────────────
  Future<void> _createSession() async {
    setState(() {
      _busy = true;
      _log = 'Creating session…';
    });
    try {
      final session = await _sdk.createSession();
      _append('✅ Session token: ${session.token}');
    } on SDKError catch (e) {
      _append('❌ $e');
    } finally {
      setState(() => _busy = false);
    }
  }

  // ── Step 2: Verify identity ───────────────────────────────────────────────
  Future<void> _verifyIdentity() async {
    setState(() {
      _busy = true;
      _log = 'Verifying identity…';
    });
    try {
      final result = await _sdk.startOnboarding(
        onboardingType: OnboardingType.bvn,
        idNumber: '22012345678',
        nameToConfirm: 'Amara Okafor',
      );
      _append('Status: ${result.status}');
      _append('Name matched: ${result.match.nameMatched}');
      _append('Confidence: ${result.match.confidence.toStringAsFixed(2)}');
    } on SDKError catch (e) {
      _append('❌ $e');
    } finally {
      setState(() => _busy = false);
    }
  }

  // ── Step 3: Full liveness check ───────────────────────────────────────────
  Future<void> _livenessCheck() async {
    setState(() {
      _busy = true;
      _log = 'Starting liveness check…';
    });
    try {
      final result = await _sdk.liveness.startCheck(
        context,
        actions: ['smile', 'blink'],
      );
      _append('Liveness status: ${result.status}');
      if (result.isVerified) {
        _append('Score: ${result.verificationScore}');
        _append('Actions matched: ${result.actionsMatched}');
      } else {
        _append('Reason: ${result.reason}');
        _append('Can retry: ${result.canRetry}');
      }
    } on SDKError catch (e) {
      _append('❌ $e');
    } finally {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('SmartComply SDK Demo')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ElevatedButton(
              onPressed: _busy ? null : _createSession,
              child: const Text('1. Create Session'),
            ),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: _busy ? null : _verifyIdentity,
              child: const Text('2. Verify Identity (BVN)'),
            ),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: _busy ? null : _livenessCheck,
              child: const Text('3. Start Liveness Check'),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: SingleChildScrollView(
                  child: Text(
                    _log,
                    style:
                        const TextStyle(fontFamily: 'monospace', fontSize: 13),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
