const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- LUA CLIENT API ---
app.get('/api/verify', async (req, res) => {
    const { key, hwid } = req.query;
    let { data: user, error } = await supabase.from('keys').select('*').eq('key', key).single();
    if (error || !user) return res.json({ success: false, message: "Invalid Key" });
    
    if (!user.hwid) {
        await supabase.from('keys').update({ hwid: hwid, status: 'ONLINE' }).eq('id', user.id);
        return res.json({ success: true });
    }
    if (user.hwid === hwid) {
        await supabase.from('keys').update({ status: 'ONLINE', last_seen: new Date() }).eq('id', user.id);
        return res.json({ success: true });
    }
    return res.json({ success: false, message: "HWID Mismatch" });
});

app.get('/api/heartbeat', async (req, res) => {
    const { hwid } = req.query;
    await supabase.from('keys').update({ last_seen: new Date() }).eq('hwid', hwid);
    let { data: user } = await supabase.from('keys').select('command, code_to_run').eq('hwid', hwid).single();
    let { data: global } = await supabase.from('global_broadcast').select('command').eq('id', 1).single();

    let finalCommand = null, finalCode = null;
    if (user && user.command) {
        finalCommand = user.command;
        finalCode = user.code_to_run;
        await supabase.from('keys').update({ command: null, code_to_run: null }).eq('hwid', hwid);
    } else if (global && global.command) {
        finalCommand = global.command;
        await supabase.from('global_broadcast').update({ command: null }).eq('id', 1);
    }
    res.json({ command: finalCommand, code: finalCode });
});

// --- WEB PANEL API ---
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
