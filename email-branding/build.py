from pathlib import Path
import html,json
root=Path(__file__).parent
copy={
 'confirmation':{
  'ru':{'subject':'Подтвердите почту · TO-DO Personal','label':'ПОДТВЕРЖДЕНИЕ ПОЧТЫ','title':'Ваш блокнот почти готов','intro':'Подтвердите адрес электронной почты, чтобы завершить регистрацию в TO-DO Personal.','action':'Подтвердить почту','after':'После подтверждения можно продолжить вход в приложении или веб-версии.','safety':'Если вы не создавали аккаунт, просто проигнорируйте это письмо.','fallback':'Если кнопка не открывается, скопируйте ссылку в браузер:','foot':'Личный блокнот для мыслей и планов','help':'Поддержка','privacy':'Конфиденциальность'},
  'en':{'subject':'Confirm your email · TO-DO Personal','label':'EMAIL CONFIRMATION','title':'Your notebook is almost ready','intro':'Confirm your email address to finish creating your TO-DO Personal account.','action':'Confirm email','after':'Once confirmed, continue signing in through the app or web version.','safety':'If you did not create an account, you can ignore this email.','fallback':'If the button does not open, copy this link into your browser:','foot':'A personal notebook for ideas and plans','help':'Support','privacy':'Privacy'}},
 'recovery':{
  'ru':{'subject':'Восстановление пароля · TO-DO Personal','label':'ВОССТАНОВЛЕНИЕ ПАРОЛЯ','title':'Задайте новый пароль','intro':'Мы получили запрос на восстановление доступа к вашему аккаунту TO-DO Personal.','action':'Создать новый пароль','after':'Задайте новый пароль на открывшемся экране. Ссылка одноразовая; если она устарела, запросите новое письмо в приложении.','safety':'Если вы не запрашивали восстановление, просто проигнорируйте письмо. Сам запрос не меняет ваш пароль.','fallback':'Если кнопка не открывается, скопируйте ссылку в браузер:','foot':'Личный блокнот для мыслей и планов','help':'Поддержка','privacy':'Конфиденциальность'},
  'en':{'subject':'Reset your password · TO-DO Personal','label':'PASSWORD RESET','title':'Choose a new password','intro':'We received a request to restore access to your TO-DO Personal account.','action':'Create new password','after':'Choose your new password on the screen that opens. This link is single-use; if it has expired, request a new email in the app.','safety':'If you did not request a password reset, ignore this email. The request alone does not change your password.','fallback':'If the button does not open, copy this link into your browser:','foot':'A personal notebook for ideas and plans','help':'Support','privacy':'Privacy'}}
}
condition='{{ if eq (printf "%v" .Data.todo_personal_language) "ru" }}'
def local(key,kind,lang=None):
 if lang:return html.escape(copy[kind][lang][key])
 return condition+html.escape(copy[kind]['ru'][key])+'{{ else }}'+html.escape(copy[kind]['en'][key])+'{{ end }}'
def render(kind,lang=None):
 t=lambda key:local(key,kind,lang)
 language=lang or condition+'ru{{ else }}en{{ end }}'
 url='https://example.test/confirmation-preview' if lang else '{{ .ConfirmationURL }}'
 return f'''<!doctype html>
<html lang="{language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>{t('subject')}</title></head>
<body style="margin:0;padding:0;background-color:#F7F3EE;color:#501F3A;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">{t('intro')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F7F3EE"><tr><td align="center" style="padding:28px 12px;">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;border:1px solid #E5D6DC;border-radius:22px;background-color:#FFFDFB;" bgcolor="#FFFDFB">
<tr><td height="5" bgcolor="#C38D9E" style="height:5px;border-radius:22px 22px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:28px 24px 12px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="40" height="40" align="center" valign="middle" bgcolor="#C38D9E" style="width:40px;height:40px;border-radius:12px;color:#501F3A;font:bold 27px/40px Arial,Helvetica,sans-serif;letter-spacing:-3px;">//</td><td style="padding-left:12px;font-size:17px;font-weight:bold;letter-spacing:1px;color:#501F3A;">TO-DO <span style="font-weight:normal;letter-spacing:0;">Personal</span></td></tr></table></td></tr>
<tr><td style="padding:20px 24px 28px;">
<p style="margin:0 0 14px;font-size:11px;line-height:1.6;letter-spacing:1.1px;font-weight:bold;color:#806C77;">{t('label')}</p>
<h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;letter-spacing:-.6px;font-weight:bold;color:#501F3A;overflow-wrap:anywhere;">{t('title')}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#806C77;">{t('intro')}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#C38D9E" style="border:1px solid #B98193;border-radius:12px;mso-padding-alt:16px 16px;"><a href="{url}" style="display:block;padding:16px;font:bold 16px/1.4 Arial,Helvetica,sans-serif;text-decoration:none;color:#501F3A;border-radius:12px;">{t('action')}</a></td></tr></table>
<p style="margin:20px 0 22px;font-size:14px;line-height:1.6;color:#806C77;">{t('after')}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#F7F3EE" style="padding:16px;border-radius:12px;border-left:3px solid #C38D9E;"><p style="margin:0;font-size:13px;line-height:1.6;color:#725562;">{t('safety')}</p></td></tr></table>
<p style="margin:22px 0 8px;font-size:12px;line-height:1.6;color:#806C77;">{t('fallback')}</p>
<a href="{url}" style="font-size:12px;line-height:1.6;word-break:break-all;overflow-wrap:anywhere;color:#725562;text-decoration:underline;">{url}</a>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;"><tr><td align="center" style="padding:20px 12px 0;font-size:12px;line-height:1.8;color:#725562;">TO-DO Personal &middot; {t('foot')}<br><a href="mailto:support@m1strell.com" style="color:#725562;text-decoration:underline;">{t('help')}</a>&nbsp;&nbsp;&middot;&nbsp;&nbsp;<a href="https://todo.m1strell.com/privacy.html" style="color:#725562;text-decoration:underline;">{t('privacy')}</a></td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>'''
patch={}
for kind in copy:
 content=render(kind)
 (root/'templates'/f'{kind}.html').write_text(content)
 subject=condition+copy[kind]['ru']['subject']+'{{ else }}'+copy[kind]['en']['subject']+'{{ end }}'
 (root/'templates'/f'{kind}-subject.txt').write_text(subject+'\n')
 patch[f'mailer_subjects_{kind}']=subject
 patch[f'mailer_templates_{kind}_content']=content
 for lang in ['ru','en']:(root/'previews'/f'{kind}-{lang}.html').write_text(render(kind,lang))
(root/'auth-email-patch.json').write_text(json.dumps(patch,ensure_ascii=False,indent=2)+'\n')
print('Built two bilingual templates, subjects, narrow config patch and four previews')
