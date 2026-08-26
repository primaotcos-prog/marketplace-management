create or replace function public.simulate_gameboost_order(
  p_marketplace_account_id uuid,
  p_event text,
  p_payload jsonb,
  p_quantity integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_listing public.listings%rowtype;
  v_qty integer := greatest(1, coalesce(p_quantity, 1));
begin
  select * into v_listing
  from public.listings
  where marketplace_account_id = p_marketplace_account_id
    and external_offer_id = p_payload->>'_resolved_offer_id'
  limit 1;

  if v_listing.id is null then
    return jsonb_build_object(
      'listing_matched', false,
      'external_offer_id', p_payload->>'_resolved_offer_id',
      'requested_quantity', v_qty,
      'stock_changed', false,
      'message', 'Listing GameBoost offer tidak ditemukan.'
    );
  end if;

  return jsonb_build_object(
    'listing_matched', true,
    'listing_id', v_listing.id,
    'product_id', v_listing.product_id,
    'external_offer_id', v_listing.external_offer_id,
    'title', v_listing.title,
    'stock_before', v_listing.stock,
    'requested_quantity', v_qty,
    'sufficient_stock', v_listing.stock >= v_qty,
    'expected_stock_after', v_listing.stock - v_qty,
    'stock_changed', false,
    'order_created', false,
    'message', 'Simulation only. No order or stock mutation was performed.'
  );
end;
$function$;

grant execute on function public.simulate_gameboost_order(uuid, text, jsonb, integer) to service_role;
