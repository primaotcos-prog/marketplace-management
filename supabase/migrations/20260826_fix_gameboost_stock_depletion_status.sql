create or replace function public.process_gameboost_order(p_marketplace_account_id uuid, p_user_id uuid, p_event text, p_event_id text, p_payload jsonb, p_external_order_id text, p_buyer_reference text, p_quantity integer, p_amount numeric, p_currency text, p_status text, p_delivery_status text, p_created_at timestamp with time zone, p_updated_at timestamp with time zone)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_existing public.orders%rowtype;
  v_listing public.listings%rowtype;
  v_order public.orders%rowtype;
  v_qty integer := greatest(1, coalesce(p_quantity, 1));
begin
  if p_external_order_id is null or btrim(p_external_order_id) = '' then
    raise exception 'GameBoost order id tidak ditemukan';
  end if;

  select * into v_listing
  from public.listings
  where marketplace_account_id = p_marketplace_account_id
    and external_offer_id = p_payload->>'_resolved_offer_id'
  for update;

  select * into v_existing
  from public.orders
  where marketplace_account_id = p_marketplace_account_id
    and external_order_id = p_external_order_id
  for update;

  if found then
    return jsonb_build_object(
      'persisted', true,
      'action', 'already_exists',
      'order_id', v_existing.id,
      'external_order_id', p_external_order_id,
      'product_id', v_existing.product_id,
      'listing_matched', v_listing.id is not null,
      'stock_changed', false,
      'stock_after', case when v_listing.id is not null then v_listing.stock else null end
    );
  end if;

  if v_listing.id is null then
    raise exception 'Listing GameBoost offer % tidak ditemukan untuk account %', p_payload->>'_resolved_offer_id', p_marketplace_account_id;
  end if;

  if v_listing.stock < v_qty then
    raise exception 'Stok tidak cukup untuk offer %: tersedia %, diminta %', v_listing.external_offer_id, v_listing.stock, v_qty;
  end if;

  update public.listings
  set stock = stock - v_qty,
      updated_at = now(),
      status = case when stock - v_qty <= 0 then 'sold_out' else status end
  where id = v_listing.id
  returning * into v_listing;

  insert into public.orders (
    user_id, marketplace_account_id, product_id, external_order_id,
    buyer_reference, quantity, amount, currency, status, delivery_status,
    raw_data, created_at, updated_at
  ) values (
    p_user_id, p_marketplace_account_id, v_listing.product_id, p_external_order_id,
    nullif(p_buyer_reference, ''), v_qty, p_amount, p_currency, p_status,
    p_delivery_status, p_payload - '_resolved_offer_id', p_created_at, p_updated_at
  )
  returning * into v_order;

  return jsonb_build_object(
    'persisted', true,
    'action', 'created',
    'order_id', v_order.id,
    'external_order_id', p_external_order_id,
    'product_id', v_listing.product_id,
    'listing_id', v_listing.id,
    'listing_matched', true,
    'stock_changed', true,
    'quantity_decremented', v_qty,
    'stock_after', v_listing.stock
  );
exception
  when unique_violation then
    select * into v_existing
    from public.orders
    where marketplace_account_id = p_marketplace_account_id
      and external_order_id = p_external_order_id
    limit 1;
    if found then
      return jsonb_build_object(
        'persisted', true,
        'action', 'already_exists',
        'order_id', v_existing.id,
        'external_order_id', p_external_order_id,
        'product_id', v_existing.product_id,
        'listing_matched', true,
        'stock_changed', false
      );
    end if;
    raise;
end;
$function$;
