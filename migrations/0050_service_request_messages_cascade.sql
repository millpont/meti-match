-- sender_account_id originally had no ON DELETE behavior, which blocked deleting an account that
-- had sent a message even though request_id's cascade would clean up the same row anyway (ANY
-- non-cascading FK referencing a row blocks its deletion, regardless of other cascades) --
-- confirmed by a pytest teardown failure. There's no reason to preserve a message after its
-- sender's account is gone, so this makes it cascade too.
alter table service_request_messages drop constraint if exists service_request_messages_sender_account_id_fkey;
alter table service_request_messages
  add constraint service_request_messages_sender_account_id_fkey
  foreign key (sender_account_id) references accounts(id) on delete cascade;
