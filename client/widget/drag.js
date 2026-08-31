/* Shared pointer controller for the title and four window edges. */
window.setupWidgetDragging = function ({ regions, enabled, move, onError }) {
    let gesture = null;
    let pendingX = 0, pendingY = 0;
    let frame = null;
    let moving = false;

    function finish(cancelled = false) {
        const previous = gesture;
        gesture = null;
        if (previous) {
            previous.region.classList.remove('is-dragging');
            if (previous.region.hasPointerCapture(previous.id)) {
                previous.region.releasePointerCapture(previous.id);
            }
        }
        if (cancelled) pendingX = pendingY = 0;
    }

    async function flush() {
        frame = null;
        if (moving || (!pendingX && !pendingY)) return;
        moving = true;
        const dx = pendingX, dy = pendingY;
        pendingX = pendingY = 0;
        try {
            await move(dx, dy);
        } catch (error) {
            finish(true);
            onError(error);
        } finally {
            moving = false;
            schedule();
        }
    }

    function schedule() {
        if (frame === null && !moving && (pendingX || pendingY)) {
            frame = requestAnimationFrame(flush);
        }
    }

    function collect(event) {
        if (!gesture || event.pointerId !== gesture.id) return;
        if (!gesture.started) {
            if (Math.hypot(event.screenX - gesture.x, event.screenY - gesture.y) < 3) return;
            gesture.started = true;
        }
        pendingX += event.screenX - gesture.x;
        pendingY += event.screenY - gesture.y;
        gesture.x = event.screenX;
        gesture.y = event.screenY;
        schedule();
    }

    for (const region of regions) {
        region.addEventListener('pointerdown', event => {
            if (event.button !== 0 || gesture || !enabled()) return;
            if (event.target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
            gesture = { id: event.pointerId, region, x: event.screenX, y: event.screenY, started: false };
            try {
                region.setPointerCapture(event.pointerId);
            } catch (error) {
                finish(true);
                onError(error);
                return;
            }
            region.classList.add('is-dragging');
            event.preventDefault();
        });
        region.addEventListener('pointermove', event => {
            if (!gesture || event.pointerId !== gesture.id) return;
            // Recover if the mouse button was released outside the application.
            if (event.pointerType === 'mouse' && !(event.buttons & 1)) {
                finish(true);
                return;
            }
            collect(event);
        });
        region.addEventListener('pointerup', event => {
            if (!gesture || event.pointerId !== gesture.id) return;
            collect(event); // Preserve the last delta even without a final pointermove.
            finish();
        });
        for (const name of ['pointercancel', 'lostpointercapture']) {
            region.addEventListener(name, event => {
                if (gesture && event.pointerId === gesture.id) finish(true);
            });
        }
    }
    window.addEventListener('blur', () => finish(true));
};
