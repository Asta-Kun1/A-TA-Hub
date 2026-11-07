const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient('https://tqghmahuiilrtelodsaq.supabase.co', 'sb_publishable_cO5Go8oak5ETgrR4z62aoA_cZODOdos');

// --- API FOR THE LUA CLIENT ---

app.get('/api/verify', async (req, res) => {
    const { key, hwid } = req.query;
    
    // Check if key exists
    let { data: user } = await supabase.from('keys').select('*').eq('key', key).single();
    if (!user) return res.json({ success: false, message: "Invalid Key" });

    // If no HWID, lock it
    if (!user.hwid) {
        await supabase.from('keys').update({ hwid: hwid, status: 'ONLINE' }).eq('id', user.id);
        return res.json({ success: true });
    }

    // Check HWID
    if (user.hwid === hwid) {
        await supabase.from('keys').update({ status: 'ONLINE', last_seen: new Date() }).eq('id', user.id);
        return res.json({ success: true });
    }

    return res.json({ success: false, message: "HWID Mismatch" });
});

app.get('/api/heartbeat', async (req, res) => {
    const { hwid } = req.query;
    
    // Update last seen
    await supabase.from('keys').update({ last_seen: new Date() }).eq('hwid', hwid);

    // Check for specific user command
    let { data: user } = await supabase.from('keys').select('command, code_to_run').eq('hwid', hwid).single();
    
    // Check for global broadcast
    let { data: global } = await supabase.from('global_broadcast').select('command').eq('id', 1).single();

    let finalCommand = null;
    let finalCode = null;

    if (user && user.command) {
        finalCommand = user.command;
        finalCode = user.code_to_run;
        // Clear command after sending
        await supabase.from('keys').update({ command: null, code_to_run: null }).eq('hwid', hwid);
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
    const { note } = req.body;
    // Generate random key
    const newKey = 'ANG3L-' + Math.random().toString(36).substring(2, 8).toUpperCase() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));