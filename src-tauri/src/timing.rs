// Opt-in timing lines for command latency investigation (CUTLIST_DEBUG_TIMING=1).

use std::{
    sync::atomic::{AtomicU64, Ordering},
    time::Instant,
};

pub(crate) static NEXT_TIMING_ID: AtomicU64 = AtomicU64::new(1);

pub(crate) fn debug_timing_enabled() -> bool {
    std::env::var("CUTLIST_DEBUG_TIMING").as_deref() == Ok("1")
}

pub(crate) fn next_timing_id() -> String {
    format!("{:x}", NEXT_TIMING_ID.fetch_add(1, Ordering::Relaxed))
}

pub(crate) fn log_timing(event: &str, command: &str, timing_id: &str, started_at: Instant) {
    if debug_timing_enabled() {
        eprintln!(
            "[cutlist:timing] {event} command={command} id={timing_id} duration_ms={}",
            started_at.elapsed().as_millis()
        );
    }
}
