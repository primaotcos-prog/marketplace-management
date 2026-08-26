import { supabase } from './supabase.js';

const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

export function mountOrderTest(){
  const box=document.getElementById('order-test-root');
  if(!box)return;
  box.innerHTML=`<div class="panel"><div class="panel-head"><div><strong>Order Dashboard Test</strong><div class="form-subtitle">Test internal dashboard tanpa membuat order GameBoost atau mengubah stock.</div></div></div><button class="action primary-small" id="create-synthetic-order">Create Synthetic Order</button><div id="order-test-result" class="empty compact-empty" style="margin-top:12px">Belum ada test.</div></div>`;
  document.getElementById('create-synthetic-order').addEventListener('click',async()=>{
    const btn=document.getElementById('create-synthetic-order'),out=document.getElementById('order-test-result');
    btn.disabled=true;btn.textContent='Creating...';
    try{
      const {data:account,error:ae}=await supabase.from('marketplace_accounts').select('id,display_name,marketplace').limit(1).maybeSingle();
      if(ae)throw ae;if(!account)throw new Error('Belum ada marketplace account.');
      const {data:product,error:pe}=await supabase.from('products').select('id,name,game').limit(1).maybeSingle();
      if(pe)throw pe;if(!product)throw new Error('Belum ada product.');
      const external=`DASHBOARD-TEST-${Date.now()}`;
      const payload={marketplace_account_id:account.id,product_id:product.id,external_order_id:external,buyer_reference:'synthetic-test-buyer',quantity:1,amount:1,currency:'USD',status:'confirmed',delivery_status:'pending',raw_data:{test:true,source:'dashboard-order-test',message:'Synthetic test only. No GameBoost order or stock mutation.'}};
      const {data:row,error}=await supabase.from('orders').insert(payload).select('id,external_order_id,status,delivery_status,created_at').single();
      if(error)throw error;
      out.innerHTML=`<div class="status-row"><span>Result</span><strong class="status">SUCCESS</strong></div><div class="status-row"><span>Order ID</span><strong>${esc(row.external_order_id)}</strong></div><div class="status-row"><span>Product</span><strong>${esc(product.name)}</strong></div><div class="status-row"><span>Message</span><span>Record test berhasil dibuat. Buka Orders dan tekan Refresh.</span></div>`;
    }catch(e){out.innerHTML=`<div class="empty">Gagal: ${esc(e.message)}</div>`}finally{btn.disabled=false;btn.textContent='Create Synthetic Order'}
  });
}
