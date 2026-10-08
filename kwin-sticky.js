function stickIfOurs(w) {
    try {
        if (!w) return;
        var caption = w.caption || '';
        var cls = String(w.resourceClass || w.resourceName || '');
        if (caption.indexOf('ClodikPet') === -1 && cls.toLowerCase().indexOf('clodik') === -1) return;
        if ('desktops' in w) w.desktops = [];
        if ('onAllDesktops' in w) w.onAllDesktops = true;
        if ('keepAbove' in w) w.keepAbove = true;
    } catch (e) {}
}

try {
    var list = (typeof workspace.windowList === 'function') ? workspace.windowList() : workspace.clientList();
    list.forEach(stickIfOurs);
} catch (e) {}

try {
    if (workspace.windowAdded) workspace.windowAdded.connect(stickIfOurs);
    else if (workspace.clientAdded) workspace.clientAdded.connect(stickIfOurs);
} catch (e) {}
