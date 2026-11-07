const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// Load secrets from Render Environment Variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("CRITICAL ERROR: Missing Supabase Environment Variables!");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// --- API FOR THE LUA CLIENT ---

app.get('/api/verify', async (req, res) => {
    const { key, hwid } = req.query;
    
    // Check if key exists
    let { data: user, error } = await supabase.from('keys').select('*').eq('key', key).single();
    if (error || !user) return res.json({ success: false, message: "Invalid Key" });

    // Block disabled keys
    if (user.status === 'DISABLED') {
        return res.json({ success: false, message: "This key has been disabled." });
    }

    // If no HWID is locked to this key, lock it to the current user
    if (!user.hwid) {
        await supabase.from('keys').update({ hwid: hwid, status: 'ONLINE' }).eq('id', user.id);
        return res.json({ success: true });
    }

    // If HWID matches, allow login
    if (user.hwid === hwid) {
        await supabase.from('keys').update({ status: 'ONLINE', last_seen: new Date() }).eq('id', user.id);
        return res.json({ success: true });
    }

    // If HWID doesn't match, deny
    return res.json({ success: false, message: "HWID Mismatch. Key is locked to another PC." });
});

app.get('/api/heartbeat', async (req, res) => {
    const { hwid } = req.query;
    
    // Check if the user was disabled or deleted while in-game
    let { data: user } = await supabase.from('keys').select('*').eq('hwid', hwid).single();
    if (!user) return res.json({ command: "KICK" }); // If deleted from DB, kick them
    if (user.status === 'DISABLED') return res.json({ command: "KICK" }); // If disabled, kick them

    // Update last seen so the panel knows they are still in game
    await supabase.from('keys').update({ last_seen: new Date() }).eq('id', user.id);

    // Check if there is a global broadcast
    let { data: global } = await supabase.from('global_broadcast').select('command').eq('id', 1).single();

    let finalCommand = null;
    let finalCode = null;

    if (user.command) {
        finalCommand = user.command;
        finalCode = user.code_to_run;
        // Clear command after sending
        await supabase.from('keys').update({ command: null, code_to_run: null }).eq('id', user.id);
    } else if (global && global.command) {
        finalCommand = global.command;
        // Clear global command after sending
        await supabase.from('global_broadcast').update({ command: null }).eq('id', 1);
    }

    res.json({ command: finalCommand, code: finalCode });
});

// --- API FOR THE WEB PANEL ---

app.get('/api/users', async (req, res) => {
    let { data } = await supabase.from('keys').select('*').order('last_seen', { ascending: false });
    res.json(data);
});

app.post('/api/generate', async (req, res) => {
    const newKey = 'A$TA-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    await supabase.from('keys').insert([{ key: newKey, status: 'OFFLINE' }]);
    res.json({ key: newKey });
});

app.post('/api/command', async (req, res) => {
    const { hwid, command, code } = req.body;
    
    if (hwid === 'ALL') {
        await supabase.from('global_broadcast').update({ command: command }).eq('id', 1);
    } else {
        await supabase.from('keys').update({ command: command, code_to_run: code }).eq('hwid', hwid);
    }
    res.json({ success: true });
});

// --- NEW ADMIN ACTIONS ---

app.post('/api/delete', async (req, res) => {
    const { id } = req.body;
    await supabase.from('keys').delete().eq('id', id);
    res.json({ success: true });
});

app.post('/api/toggle_disable', async (req, res) => {
    const { id, currentStatus } = req.body;
    const newStatus = currentStatus === 'DISABLED' ? 'OFFLINE' : 'DISABLED';
    await supabase.from('keys').update({ status: newStatus }).eq('id', id);
    res.json({ success: true });
});

app.post('/api/reset_hwid', async (req, res) => {
    const { id } = req.body;
    await supabase.from('keys').update({ hwid: null, status: 'OFFLINE' }).eq('id', id);
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Secure Backend running on port ${PORT}`));
