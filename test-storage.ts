// Crea este archivo solo para probar
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('TU_URL', 'TU_SECRET_KEY');

async function test() {
    const { data, error } = await supabase.storage
        .from('tesis-files')
        .upload('test.txt', Buffer.from('Hola mundo'));

    if (error) console.error('Error:', error);
    else console.log('¡Éxito!', data);
}
test();