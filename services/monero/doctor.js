import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ok = m => console.log(`  [OK]    ${m}`);
const bad = m => console.log(`  [EKSİK] ${m}`);
const info = m => console.log(`  [BİLGİ] ${m}`);

async function rpcCall(rpcUrl, auth, method, params = {}) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(auth).toString('base64')
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'viarela', method, params })
  });
  return res.json();
}

async function main() {
  let exitCode = 0;
  console.log('');
  console.log('Viarela Monero köprüsü — kurulum kontrolü');
  console.log('----------------------------------------');

  const cfgPath = process.env.XMR_BRIDGE_CONFIG || join(__dirname, 'config.json');
  if (!existsSync(cfgPath)) {
    bad('config.json yok -> config.example.json kopyalayıp doldurun, sonra tekrar çalıştırın');
    console.log('');
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(cfgPath, 'utf8'));
  const supabaseUrl = process.env.SUPABASE_URL || raw.supabaseUrl || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || raw.supabaseServiceRoleKey || '';
  const mainAddress = raw.mainAddress || '';
  const { rpcUrl = 'http://127.0.0.1:18283', username = '', password = '' } = raw.wallet || {};

  if (mainAddress) {
    ok(`nihai alıcı adresi: ${mainAddress}`);
  } else {
    bad('mainAddress boş (config.example.json daki nihai cüzdan adresini kopyalayın)');
    exitCode = 1;
  }

  if (!supabaseUrl || !key) {
    bad('supabaseServiceRoleKey dolu değil (Supabase > Project Settings > API > service_role)');
    exitCode = 1;
  } else {
    ok(`Supabase yapılandırması: ${supabaseUrl}`);
  }

  if (username && password && password !== 'CHANGE_ME') {
    ok('wallet-rpc oturumu (username/password) yapılandırılmış');
  } else {
    bad('wallet username/password ayarlanmamış ya da hâlâ CHANGE_ME (README Adım 4-6)');
    exitCode = 1;
  }

  if (supabaseUrl && key) {
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/xmr_address_pool?select=status`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` }
      });
      if (r.ok) {
        const rows = await r.json();
        const unused = (rows || []).filter(x => x.status === 'unused').length;
        info(`Supabase erişilebilir; havuzda boş adres: ${unused}`);
        if (unused < 10) {
          bad(`havuz az: ${unused} boş adres (cüzdan hazırsa: npm run seed)`);
          exitCode = 1;
        } else {
          ok('adres havuzu faturalar için hazır');
        }
      } else {
        bad(`Supabase REST ${r.status} — service_role doğru mu, proje URL doğru mu?`);
        exitCode = 1;
      }
    } catch (e) {
      bad(`Supabase'e erişilemedi: ${e.message}`);
      exitCode = 1;
    }
  }

  if (username && password) {
    try {
      const j = await rpcCall(rpcUrl, `${username}:${password}`, 'get_height');
      if (j.error) {
        bad(`wallet-rpc hatası: ${j.error.message || JSON.stringify(j.error)}`);
        bad("monero-wallet-rpc çalışıyor mu? daemon'ın senkronu hazır mı? (README Adım 4-5)");
        exitCode = 1;
      } else {
        ok(`wallet-rpc erişilebilir (node yüksekliği ${j.result.height})`);
      }
      if (mainAddress) {
        try {
          const ai = await rpcCall(rpcUrl, `${username}:${password}`, 'get_address_index', { address: mainAddress });
          if (ai.error) {
            bad('nihai adres bu cüzdana ait DEĞİL — yanlış (view-only) cüzdan bağlanmış!');
            exitCode = 1;
          } else {
            const idx = ai.result.index || { major: 0, minor: 0 };
            ok(`nihai adres cüzdana ait (index ${idx.major} ${idx.minor})`);
          }
        } catch (e) {
          info('get_address_index denetlenemedi (RPC sürümü) — adres manuel gözle doğrulansın');
        }
      }
    } catch (e) {
      bad(`wallet-rpc [${rpcUrl}] bağlantı kurulamadı — wallet-rpc'i başlattınız mı? (README Adım 5)`);
      exitCode = 1;
    }
  }

  console.log('');
  if (exitCode === 0) {
    console.log('Sonuç: bu makinede eksik yok. Havuzu doldurmak için: npm run seed');
    console.log('Sürekli çalıştırmak için: start.bat (veya Görev Zamanlayıcı)');
  } else {
    console.log('Sonuç: yukarıdaki [EKSİK] adımları tamamlayın, sonra tekrar çalıştırın.');
  }
  console.log('');
  process.exit(exitCode);
}

main().catch(e => { console.error(e); process.exit(1); });