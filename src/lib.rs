use napi_derive::napi;
use probe::probe_lazy;
use std::ffi::CString;

/// Canary probe — used to detect whether a tracer (e.g. bpftrace) is attached.
/// Returns true if the probe is being actively traced, false otherwise.
/// The JavaScript layer caches this result for 1 second to minimize overhead.
#[napi]
pub fn canary() -> bool {
    probe_lazy!(compass, canary)
}

// ---------------------------------------------------------------------------
// HTTP probes (equivalent to PHP extension's fpm_* probes)
// ---------------------------------------------------------------------------

/// Fires when an HTTP server request begins.
/// Captures the request ID (from X-Request-ID header), URI, and HTTP method.
#[napi]
pub fn http_request_init(request_id: String, uri: String, method: String) {
    let request_id = CString::new(request_id).unwrap_or_default();
    let uri = CString::new(uri).unwrap_or_default();
    let method = CString::new(method).unwrap_or_default();

    probe_lazy!(
        compass,
        http_request_init,
        request_id.as_ptr(),
        uri.as_ptr(),
        method.as_ptr()
    );
}

/// Fires when an HTTP server response is complete.
/// Captures the request ID, HTTP status code, and request duration in nanoseconds.
#[napi]
pub fn http_request_shutdown(request_id: String, status_code: i64, duration_ns: i64) {
    let request_id = CString::new(request_id).unwrap_or_default();

    probe_lazy!(
        compass,
        http_request_shutdown,
        request_id.as_ptr(),
        status_code,
        duration_ns
    );
}

/// Fires when a function exceeds the configured time threshold during an HTTP request.
/// Captures the request ID, fully-qualified function name, elapsed time in nanoseconds,
/// and current RSS memory usage in bytes.
#[napi]
pub fn http_function(
    request_id: String,
    function_name: String,
    elapsed_ns: i64,
    memory_rss: i64,
) {
    let request_id = CString::new(request_id).unwrap_or_default();
    let function_name = CString::new(function_name).unwrap_or_default();

    probe_lazy!(
        compass,
        http_function,
        request_id.as_ptr(),
        function_name.as_ptr(),
        elapsed_ns,
        memory_rss
    );
}

// ---------------------------------------------------------------------------
// CLI probes (equivalent to PHP extension's cli_* probes)
// ---------------------------------------------------------------------------

/// Fires when a CLI Node.js process starts.
/// Captures the process ID and the full command (process.argv joined).
#[napi]
pub fn cli_request_init(pid: i64, command: String) {
    let command = CString::new(command).unwrap_or_default();

    probe_lazy!(compass, cli_request_init, pid, command.as_ptr());
}

/// Fires when a CLI Node.js process exits.
/// Captures the process ID.
#[napi]
pub fn cli_request_shutdown(pid: i64) {
    probe_lazy!(compass, cli_request_shutdown, pid);
}

/// Fires when a function exceeds the configured time threshold during CLI execution.
/// Captures the process ID, fully-qualified function name, elapsed time in nanoseconds,
/// and current RSS memory usage in bytes.
#[napi]
pub fn cli_function(pid: i64, function_name: String, elapsed_ns: i64, memory_rss: i64) {
    let function_name = CString::new(function_name).unwrap_or_default();

    probe_lazy!(
        compass,
        cli_function,
        pid,
        function_name.as_ptr(),
        elapsed_ns,
        memory_rss
    );
}
