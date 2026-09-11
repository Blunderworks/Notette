import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

/// An API rejection, connection failure, or timeout that can be shown to a user.
class NotetteException implements Exception {
  const NotetteException(this.message, {this.status, this.code});
  final String message;
  final int? status;
  final String? code;
  @override
  String toString() => message;
}

/// Client for the existing Notette widget API. Own and close it in app state.
class NotetteClient {
  NotetteClient({
    required Uri serverUrl,
    required String projectKey,
    required Uri appOrigin,
    http.Client? httpClient,
    this.token,
    this.timeout = const Duration(seconds: 30),
  })  : _http = httpClient ?? http.Client(),
        _ownsHttp = httpClient == null {
    for (final uri in [serverUrl, appOrigin]) {
      if (!['http', 'https'].contains(uri.scheme) ||
          uri.host.isEmpty ||
          uri.userInfo.isNotEmpty ||
          uri.hasQuery ||
          uri.hasFragment) {
        throw ArgumentError(
            'Use absolute HTTP(S) URLs without credentials, query or fragment.');
      }
    }
    if (appOrigin.path.isNotEmpty && appOrigin.path != '/') {
      throw ArgumentError('appOrigin must not contain a path.');
    }
    if (projectKey.trim().isEmpty)
      throw ArgumentError('projectKey is required.');
    origin = kIsWeb ? Uri.base.origin : appOrigin.origin;
    final base = serverUrl.toString().replaceFirst(RegExp(r'/+$'), '');
    _base = '$base/api/widget/${Uri.encodeComponent(projectKey)}';
  }

  final http.Client _http;
  final bool _ownsHttp;
  final Duration timeout;
  late final String _base;
  late final String origin;

  /// A per-user widget session, kept in memory. Never embed an admin token.
  String? token;

  Future<Map<String, dynamic>> _request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    Uint8List? bytes,
    Map<String, String> headers = const {},
  }) async {
    final request = http.Request(method, Uri.parse('$_base$path'));
    request.headers.addAll({
      'X-Notette-Client': 'flutter',
      if (!kIsWeb) 'Origin': origin,
      if (token != null) 'Authorization': 'Bearer $token',
      ...headers,
    });
    if (bytes != null) {
      request.bodyBytes = bytes;
    } else if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    try {
      final response = await (() async =>
              http.Response.fromStream(await _http.send(request)))()
          .timeout(timeout);
      Map<String, dynamic> data;
      try {
        data = response.body.isEmpty
            ? {}
            : jsonDecode(response.body) as Map<String, dynamic>;
      } catch (_) {
        throw NotetteException('The server returned an invalid response.',
            status: response.statusCode);
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final error = data['error'];
        throw NotetteException(
          error is Map
              ? (error['message'] as String? ?? 'Request failed.')
              : 'Request failed.',
          status: response.statusCode,
          code: error is Map ? error['code'] as String? : null,
        );
      }
      return data;
    } on TimeoutException {
      throw const NotetteException(
          'Request timed out. The server may have received it; check before retrying.');
    } on http.ClientException {
      throw const NotetteException(
          'Could not reach Notette. Check your connection and server URL.');
    }
  }

  Future<Map<String, dynamic>> config() => _request('/config');

  Future<void> login(String email, String password,
      {String? turnstileToken}) async {
    final result = await _request('/auth/login', method: 'POST', body: {
      'email': email.trim(),
      'password': password,
      if (turnstileToken != null) 'turnstileToken': turnstileToken,
    });
    token = result['token'] as String;
  }

  Future<void> logout() async {
    await _request('/auth/session', method: 'DELETE');
    token = null;
  }

  Future<Map<String, dynamic>> createFeedback(Map<String, dynamic> payload) =>
      _request('/feedback', method: 'POST', body: payload);

  Future<void> uploadScreenshot(
      String id, String uploadToken, Uint8List png) async {
    await _request('/feedback/${Uri.encodeComponent(id)}/screenshot',
        method: 'PUT',
        bytes: png,
        headers: {
          'Content-Type': 'image/png',
          'X-Notette-Upload-Token': uploadToken
        });
  }

  void close() {
    if (_ownsHttp) _http.close();
  }
}
