import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://lypwmkizvskxztgijgdk.supabase.co';
const supabaseKey = 'sb_publishable_FF635Hgm281FGOsMmd-Jtw_ju52CZkL';

export const supabase = createClient(supabaseUrl, supabaseKey);
