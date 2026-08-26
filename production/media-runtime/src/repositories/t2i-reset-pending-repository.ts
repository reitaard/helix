import type { Pool } from "pg";
import type { TelegramConversationKey } from "../telegram/conversation.js";
type Key=TelegramConversationKey|string; const keyOf=(key:Key):TelegramConversationKey=>typeof key==="string"?{chatId:key,threadId:"0",userId:key}:key;
interface PendingResetRow { chat_id:string;thread_id:string;user_id:string;target_settings:unknown;invalid_attempts:number;expires_at:Date;expected_reply_message_id:string|null; }
export class T2IResetPendingRepository {
  constructor(private readonly db:Pool){}
  async get(input:Key){const k=keyOf(input);const r=await this.db.query<PendingResetRow>(`SELECT chat_id,thread_id,user_id,target_settings,invalid_attempts,expires_at,expected_reply_message_id FROM operator_pending_t2i_reset WHERE chat_id=$1 AND thread_id=$2 AND user_id=$3`,[k.chatId,k.threadId,k.userId]);return r.rows[0]??null;}
  async begin(input:Key,target:unknown,expires:Date){const k=keyOf(input);await this.db.query(`INSERT INTO operator_pending_t2i_reset (chat_id,thread_id,user_id,target_settings,invalid_attempts,expires_at) VALUES($1,$2,$3,$4::jsonb,0,$5) ON CONFLICT(chat_id,thread_id,user_id) DO UPDATE SET target_settings=EXCLUDED.target_settings,invalid_attempts=0,expected_reply_message_id=NULL,expires_at=EXCLUDED.expires_at,updated_at=NOW()`,[k.chatId,k.threadId,k.userId,JSON.stringify(target),expires]);}
  async setExpectedReply(input:Key,messageId:string){const k=keyOf(input);await this.db.query(`UPDATE operator_pending_t2i_reset SET expected_reply_message_id=$4,updated_at=NOW() WHERE chat_id=$1 AND thread_id=$2 AND user_id=$3`,[k.chatId,k.threadId,k.userId,messageId]);}
  async incrementInvalid(input:Key){const k=keyOf(input);const r=await this.db.query<PendingResetRow>(`UPDATE operator_pending_t2i_reset SET invalid_attempts=LEAST(invalid_attempts+1,3),updated_at=NOW() WHERE chat_id=$1 AND thread_id=$2 AND user_id=$3 RETURNING chat_id,thread_id,user_id,target_settings,invalid_attempts,expires_at,expected_reply_message_id`,[k.chatId,k.threadId,k.userId]);return r.rows[0]??null;}
  async remove(input:Key){const k=keyOf(input);await this.db.query(`DELETE FROM operator_pending_t2i_reset WHERE chat_id=$1 AND thread_id=$2 AND user_id=$3`,[k.chatId,k.threadId,k.userId]);}
  async expireDue(_input?:Key){const r=await this.db.query(`DELETE FROM operator_pending_t2i_reset WHERE expires_at<=NOW()`);return(r.rowCount??0)>0;}
}
