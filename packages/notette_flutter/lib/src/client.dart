import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

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
    this.persistSession = true,
    this.timeout = const Duration(seconds: 30),
    this.userTokenProvider,
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

  final bool persistSession;
  static const _storage = FlutterSecureStorage();
  Future<void>? _sessionWrite;
  String get storageKey => 'notette:$_base:$origin';
  String get dashboardBase => _base.substring(0, _base.indexOf('/api/widget/'));

  Future<void> restoreSession() async {
    if (!persistSession || token != null) return;
    try {
      token = await _storage.read(key: '$storageKey:token');
    } catch (_) {}
  }

  Future<void> saveSession() async {
    if (!persistSession) return;
    final current = token;
    _sessionWrite = (_sessionWrite ?? Future.value()).then((_) async {
      try {
        if (current == null) {
          await _storage.delete(key: '$storageKey:token');
        } else {
          await _storage.write(key: '$storageKey:token', value: current);
        }
      } catch (_) {
        /* Session stays usable in memory if storage is unavailable. */
      }
    });
    await _sessionWrite;
  }

  final http.Client _http;
  final bool _ownsHttp;
  final Duration timeout;
  late final String _base;
  late final String origin;

  /// A scoped widget session. Never embed an admin token.
  String? token;

  /// Returns an identity token that your server signed for the app's
  /// signed-in user, or null when nobody is signed in. Called whenever a
  /// token is needed; one is reused until shortly before its `exp`. While a
  /// token is available it replaces the Notette session and sign-in.
  final Future<String?> Function()? userTokenProvider;

  String? _userToken;
  DateTime? _userTokenExpiry;
  Future<String?>? _userTokenPending;
  int _identityGeneration = 0;
  String? _identityError;

  /// Why the server rejected the last identity token. Requests continue
  /// without identity until [resetIdentity] is called.
  String? get identityError => _identityError;

  /// Forgets the cached identity token and any rejection. Call it after your
  /// app's user signs in or out.
  void resetIdentity() {
    _identityGeneration++;
    _userToken = null;
    _userTokenExpiry = null;
    _userTokenPending = null;
    _identityError = null;
  }

  static DateTime? _tokenExpiry(String? token) {
    try {
      final parts = token?.split('.');
      if (parts == null || parts.length != 3) return null;
      final claims = jsonDecode(
          utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))));
      final exp = claims is Map ? claims['exp'] : null;
      return exp is num
          ? DateTime.fromMillisecondsSinceEpoch((exp * 1000).round())
          : null;
    } catch (_) {
      return null;
    }
  }

  Future<String?> _identityToken({bool refresh = false}) {
    final provider = userTokenProvider;
    if (provider == null || _identityError != null) return Future.value(null);
    final cached = _userToken;
    final expiry = _userTokenExpiry;
    if (!refresh &&
        cached != null &&
        (expiry == null ||
            expiry.difference(DateTime.now()) > const Duration(seconds: 30))) {
      return Future.value(cached);
    }
    return _userTokenPending ??= () async {
      final generation = _identityGeneration;
      try {
        final value = (await provider())?.trim();
        final result = value == null || value.isEmpty ? null : value;
        if (generation == _identityGeneration) {
          _userToken = result;
          _userTokenExpiry = _tokenExpiry(result);
        }
        return result;
      } catch (_) {
        return null;
      } finally {
        if (generation == _identityGeneration) _userTokenPending = null;
      }
    }();
  }

  /// The identity token when available, otherwise the widget session.
  Future<({String token, bool identity})?> _credential() async {
    final identity = await _identityToken();
    if (identity != null) return (token: identity, identity: true);
    final session = token;
    return session == null ? null : (token: session, identity: false);
  }

  /// Handles a 401. Returns true when a fresh identity token warrants one
  /// retry; rejected requests never reached a handler, so nothing is resent twice.
  Future<bool> _unauthorized(({String token, bool identity})? credential,
      String? code, String message, bool retried) async {
    if (credential?.identity != true) {
      token = null;
      await saveSession();
      return false;
    }
    if (code == 'identity_invalid' && !retried) {
      final fresh = await _identityToken(refresh: true);
      if (fresh != null && fresh != credential!.token) return true;
    }
    if (code?.startsWith('identity_') == true) {
      _identityError = message;
      _userToken = null;
    }
    return false;
  }

  Future<Map<String, dynamic>> _request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    Uint8List? bytes,
    Map<String, String> headers = const {},
    bool retried = false,
  }) async {
    final credential = await _credential();
    final request = http.Request(method, Uri.parse('$_base$path'));
    request.headers.addAll({
      'X-Notette-Client': 'flutter',
      if (!kIsWeb) 'Origin': origin,
      if (credential != null) 'Authorization': 'Bearer ${credential.token}',
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
        final message = error is Map
            ? (error['message'] as String? ?? 'Request failed.')
            : 'Request failed.';
        final code = error is Map ? error['code'] as String? : null;
        if (response.statusCode == 401 &&
            await _unauthorized(credential, code, message, retried)) {
          return await _request(path,
              method: method,
              body: body,
              bytes: bytes,
              headers: headers,
              retried: true);
        }
        if (response.statusCode == 503 &&
            credential?.identity == true &&
            code == 'identity_unavailable') {
          _identityError = message;
        }
        throw NotetteException(message,
            status: response.statusCode, code: code);
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
    await saveSession();
  }

  Future<void> logout() async {
    try {
      await _request('/auth/session', method: 'DELETE');
    } finally {
      token = null;
      await saveSession();
    }
  }

  Future<Map<String, dynamic>> createFeedback(Map<String, dynamic> payload) =>
      _request('/feedback', method: 'POST', body: payload);

  Future<void> uploadScreenshot(String id, String uploadToken, Uint8List png,
      {String contentType = 'image/png'}) async {
    await _request('/feedback/${Uri.encodeComponent(id)}/screenshot',
        method: 'PUT',
        bytes: png,
        headers: {
          'Content-Type': contentType,
          'X-Notette-Upload-Token': uploadToken
        });
  }

  Future<Map<String, dynamic>> listFeedback(String path,
          {bool project = false, String status = 'all', String query = ''}) =>
      _request('/feedback?${Uri(queryParameters: {
            'scope': project ? 'project' : 'page',
            'path': path,
            'status': status,
            if (query.isNotEmpty) 'q': query,
          }).query}');

  Future<Map<String, dynamic>> detail(String id) =>
      _request('/feedback/${Uri.encodeComponent(id)}');
  Future<Map<String, dynamic>> reply(String id, Map<String, dynamic> payload) =>
      _request('/feedback/${Uri.encodeComponent(id)}/comments',
          method: 'POST', body: payload);
  Future<Map<String, dynamic>> setStatus(String id, String status) =>
      _request('/feedback/${Uri.encodeComponent(id)}',
          method: 'PATCH', body: {'status': status});
  Future<void> remove(String id) async {
    await _request('/feedback/${Uri.encodeComponent(id)}', method: 'DELETE');
  }

  Future<Map<String, dynamic>> mentions() => _request('/mentions');
  Future<Map<String, dynamic>> setNotifications(bool email) =>
      _request('/notifications', method: 'PUT', body: {'email': email});
  Future<void> resendVerification(String email) async {
    await _request('/auth/verify/resend',
        method: 'POST', body: {'email': email.trim()});
  }

  Future<Map<String, dynamic>> signup(
      String name, String email, String password,
      {String? turnstileToken}) async {
    final result = await _request('/auth/signup', method: 'POST', body: {
      'name': name.trim(),
      'email': email.trim(),
      'password': password,
      if (turnstileToken != null) 'turnstileToken': turnstileToken,
    });
    if (result['token'] is String) {
      token = result['token'] as String;
      await saveSession();
    }
    return result;
  }

  Future<Map<String, dynamic>> createAuthRequest(String id, String secret) =>
      _request('/auth/requests',
          method: 'POST', body: {'id': id, 'pollSecret': secret});
  Future<Map<String, dynamic>> pollAuthRequest(String id, String secret) =>
      _request('/auth/requests/${Uri.encodeComponent(id)}/poll',
          method: 'POST', body: {'pollSecret': secret});

  Future<Uint8List> screenshot(String id) async {
    final credential = await _credential();
    final request = http.Request('GET',
        Uri.parse('$_base/feedback/${Uri.encodeComponent(id)}/screenshot'));
    request.headers.addAll({
      'X-Notette-Client': 'flutter',
      if (!kIsWeb) 'Origin': origin,
      if (credential != null) 'Authorization': 'Bearer ${credential.token}',
    });
    try {
      final response = await (() async =>
              http.Response.fromStream(await _http.send(request)))()
          .timeout(timeout);
      if (response.statusCode == 401 && credential?.identity != true) {
        token = null;
        await saveSession();
      }
      if (response.statusCode != 200) {
        throw NotetteException('Could not load screenshot.',
            status: response.statusCode);
      }
      return response.bodyBytes;
    } on TimeoutException {
      throw const NotetteException('Screenshot request timed out.');
    } on http.ClientException {
      throw const NotetteException(
          'Could not load screenshot. Check your connection.');
    }
  }

  void close() {
    if (_ownsHttp) _http.close();
  }
}
