
create table public.checkout_intents(id uuid primary key default gen_random_uuid(),brief_json jsonb not null,delivery_email text not null,amount_cents integer not null check(amount_cents=9900),currency text not null check(currency='usd'),stripe_checkout_session_id text unique,status text not null default 'pending' check(status in('pending','checkout_created','paid','expired')),order_id uuid unique references public.orders(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.stripe_events(event_id text primary key,event_type text not null,checkout_session_id text,order_id uuid references public.orders(id) on delete set null,processed_at timestamptz not null default now());
alter table public.orders add column stripe_checkout_session_id text unique,add column stripe_payment_intent_id text unique,add column payment_status text not null default 'unpaid' check(payment_status in('unpaid','paid','refunded','disputed')),add column paid_at timestamptz,add column currency text not null default 'usd' check(currency='usd');
create index idx_checkout_intents_status on public.checkout_intents(status,created_at desc);create index idx_stripe_events_order on public.stripe_events(order_id);
alter table public.checkout_intents enable row level security;alter table public.stripe_events enable row level security;
create policy "Active staff read checkout intents" on public.checkout_intents for select to authenticated using((select private.is_active_staff()));
create policy "Active staff read stripe events" on public.stripe_events for select to authenticated using((select private.is_active_staff()));
create or replace function public.finalize_stripe_checkout(p_event_id text,p_event_type text,p_checkout_session_id text,p_payment_intent_id text,p_intent_id uuid,p_amount_total integer,p_currency text,p_customer_email text,p_paid_at timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare v_intent public.checkout_intents%rowtype;v_brief jsonb;v_account_id uuid;v_contact_id uuid;v_campaign_id uuid;v_order_id uuid;v_contact_name text;v_campaign_type text;v_tone text;
begin
perform pg_advisory_xact_lock(hashtext(p_event_id));
select order_id into v_order_id from public.stripe_events where event_id=p_event_id;if found then return v_order_id;end if;
if p_amount_total<>9900 or lower(p_currency)<>'usd' then raise exception 'Unexpected checkout amount or currency';end if;
select * into v_intent from public.checkout_intents where id=p_intent_id for update;if not found then raise exception 'Checkout intent not found';end if;
if v_intent.amount_cents<>p_amount_total or v_intent.currency<>lower(p_currency) then raise exception 'Checkout does not match intent';end if;
if v_intent.order_id is not null then v_order_id:=v_intent.order_id;else
v_brief:=v_intent.brief_json;v_contact_name:=coalesce(nullif(v_brief->>'contactName',''),split_part(p_customer_email,'@',1));
v_campaign_type:=case when v_brief->>'campaignType'='Other' then v_brief->>'campaignTypeOther' else v_brief->>'campaignType' end;
v_tone:=case when v_brief->>'tone'='Other' then v_brief->>'toneOther' else v_brief->>'tone' end;
insert into public.accounts(name,account_type,website,status,source) values(v_brief->>'organizationName',v_brief->>'organizationType',nullif(v_brief->>'websiteSocial',''),'active','stripe_checkout') returning id into v_account_id;
insert into public.contacts(account_id,name,email,is_primary) values(v_account_id,v_contact_name,p_customer_email,true) returning id into v_contact_id;
insert into public.campaigns(account_id,name,campaign_family,primary_action,status) values(v_account_id,v_brief->>'campaignName',v_brief->>'campaignFamily',v_brief->>'primaryAction','active') returning id into v_campaign_id;
insert into public.orders(campaign_id,account_id,primary_contact_id,package_type,price_cents,status,stripe_checkout_session_id,stripe_payment_intent_id,payment_status,paid_at,currency) values(v_campaign_id,v_account_id,v_contact_id,'standard_99',p_amount_total,'new_intake',p_checkout_session_id,p_payment_intent_id,'paid',p_paid_at,lower(p_currency)) returning id into v_order_id;
insert into public.briefs(order_id,raw_submission_json,organization_name,campaign_name,campaign_type,date_time,location_or_link,target_audience,main_goal,offer_or_ask,key_details,tone,channels_needed,website_social_links,phrases_to_include,phrases_to_avoid,additional_notes,delivery_email) values(v_order_id,v_brief,v_brief->>'organizationName',v_brief->>'campaignName',v_campaign_type,v_brief->>'dateTime',v_brief->>'locationOrLink',v_brief->>'audience',v_brief->>'mainGoal',v_brief->>'offerAsk',v_brief->>'keyDetails',v_tone,array_to_string(array(select jsonb_array_elements_text(v_brief->'channels')),', '),v_brief->>'websiteSocial',v_brief->>'phrasesInclude',v_brief->>'phrasesAvoid',v_brief->>'additionalNotes',p_customer_email);
insert into public.activity_events(account_id,order_id,event_type,message,metadata_json) values(v_account_id,v_order_id,'payment_received','Stripe payment received; order created from customer survey.',jsonb_build_object('source','stripe_checkout','amount_cents',p_amount_total,'currency',lower(p_currency)));
update public.checkout_intents set status='paid',order_id=v_order_id,stripe_checkout_session_id=p_checkout_session_id,updated_at=now() where id=v_intent.id;
end if;
insert into public.stripe_events(event_id,event_type,checkout_session_id,order_id) values(p_event_id,p_event_type,p_checkout_session_id,v_order_id);return v_order_id;end$$;
revoke all on function public.finalize_stripe_checkout(text,text,text,text,uuid,integer,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.finalize_stripe_checkout(text,text,text,text,uuid,integer,text,text,timestamptz) to service_role;
