import {sendSmtpEmail,UncertainEmailDelivery} from "./smtp";
import type {Env} from '../types';

// No attachments: email links retain the vault's normal authentication and access checks.
export async function deliverUploadEmail(env:Env,id:string):Promise<void> {
  const claimed=await env.DB.prepare(`UPDATE upload_batches SET email_state='sending',email_lease_until=datetime('now','+2 minutes')
    WHERE id=? AND completed_at IS NOT NULL AND email_state IN ('pending','sending')
    AND email_next_attempt_at<=datetime('now') AND (email_lease_until IS NULL OR email_lease_until<datetime('now'))
    AND email_attempts<5 AND (email_first_attempt_at IS NULL OR email_first_attempt_at>datetime('now','-23 hours')) RETURNING id`).bind(id).first();
  if(!claimed)return;
  try {
    const batch=await env.DB.prepare(`SELECT b.title,b.owner_id,a.visibility,u.display_name uploader,
      (SELECT COUNT(*) FROM upload_batch_photos bp JOIN photos p ON p.id=bp.photo_id WHERE bp.batch_id=b.id AND p.status='ready') photo_count
      FROM upload_batches b JOIN users u ON u.id=b.owner_id LEFT JOIN albums a ON a.id=b.album_id WHERE b.id=?`).bind(id).first<{title:string;owner_id:string;visibility:string|null;uploader:string;photo_count:number}>();
    if(!batch || batch.visibility!=='family' || !batch.photo_count){
      await env.DB.prepare("UPDATE upload_batches SET email_state='private',email_lease_until=NULL,email_error=NULL WHERE id=?").bind(id).run();return;
    }
    const recipient=env.ADMIN_UPLOAD_EMAIL?.trim().toLowerCase();
    const admin=recipient && await env.DB.prepare("SELECT id FROM users WHERE lower(email)=? AND role='admin' AND status='active'").bind(recipient).first();
    if(!env.SMTP_USER || !env.SMTP_PASSWORD || !env.PUBLIC_APP_URL || !admin){
      await env.DB.prepare("UPDATE upload_batches SET email_state='pending',email_lease_until=NULL,email_next_attempt_at=datetime('now','+10 minutes'),email_error='Email setup or active admin recipient is missing.' WHERE id=?").bind(id).run();return;
    }
    const base=new URL(env.PUBLIC_APP_URL);
    if(base.protocol!=='https:')throw new Error('A secure public app URL is required.');
    const link=new URL(`/collections/${encodeURIComponent(id)}`,base).href;
    const message=`${batch.uploader} shared ${batch.photo_count} photographs: ${batch.title}\n${link}`;
    const whatsapp=`https://wa.me/?text=${encodeURIComponent(message)}`;
    await env.DB.prepare("UPDATE upload_batches SET email_attempts=email_attempts+1,email_first_attempt_at=COALESCE(email_first_attempt_at,datetime('now')),email_recipient=? WHERE id=?").bind(recipient,id).run();
    const data=await sendSmtpEmail(env,{to:recipient!,id,subject:`New family pictures: ${batch.title}`,text:`${message}\n\nSign in to Family Vault to view the collection.\n\nShare with the family on WhatsApp:\n${whatsapp}\n\nThis is one notification for the upload collection, not one per picture.`});
    await env.DB.prepare("UPDATE upload_batches SET email_state='sent',email_sent_at=datetime('now'),email_lease_until=NULL,email_provider_id=?,email_error=NULL WHERE id=?").bind(data.id,id).run();
  } catch(error) {
    if(error instanceof UncertainEmailDelivery){
      await env.DB.prepare("UPDATE upload_batches SET email_state='failed',email_lease_until=NULL,email_error=? WHERE id=?").bind(error.message,id).run();return;
    }
    await env.DB.prepare(`UPDATE upload_batches SET email_state=CASE WHEN email_attempts>=5 THEN 'failed' ELSE 'pending' END,
      email_lease_until=NULL,email_next_attempt_at=datetime('now','+10 minutes'),email_error=? WHERE id=?`)
      .bind(error instanceof Error ? error.message : 'Email delivery failed.',id).run();
  }
}

export async function retryUploadEmails(env:Env):Promise<void> {
  await env.DB.prepare(`UPDATE upload_batches SET email_state='failed',email_lease_until=NULL,email_error='Automatic retry limit reached. Check email provider delivery.'
    WHERE email_state IN ('pending','sending') AND (email_lease_until IS NULL OR email_lease_until<datetime('now'))
    AND (email_attempts>=5 OR email_first_attempt_at<=datetime('now','-23 hours'))`).run();
  const due=await env.DB.prepare(`SELECT id FROM upload_batches WHERE completed_at IS NOT NULL AND email_state IN ('pending','sending')
    AND email_next_attempt_at<=datetime('now') AND (email_lease_until IS NULL OR email_lease_until<datetime('now'))
    AND email_attempts<5 AND (email_first_attempt_at IS NULL OR email_first_attempt_at>datetime('now','-23 hours')) ORDER BY created_at LIMIT 10`).all<{id:string}>();
  for(const row of due.results)await deliverUploadEmail(env,row.id);
}
