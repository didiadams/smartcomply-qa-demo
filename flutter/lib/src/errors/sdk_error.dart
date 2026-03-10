/// Custom exception thrown by the SmartComply SDK on HTTP or logic errors.
class SDKError implements Exception {
  final String message;
  final int? statusCode;

  const SDKError(this.message, [this.statusCode]);

  @override
  String toString() => statusCode != null
      ? 'SDKError($statusCode): $message'
      : 'SDKError: $message';
}
