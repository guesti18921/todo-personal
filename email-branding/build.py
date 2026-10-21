from pathlib import Path
import html,json
root=Path(__file__).parent
copy={
 'confirmation':{
  'ru':{'subject':'Подтвердите почту · TO-DO Personal','label':'ПОДТВЕРЖДЕНИЕ ПОЧТЫ','title':'Ваш блокнот почти готов','intro':'Подтвердите адрес электронной почты, чтобы завершить регистрацию в TO-DO Personal.','action':'Подтвердить почту','after':'После подтверждения можно продолжить вход в приложении или веб-версии.','safety':'Если вы не создавали аккаунт, просто проигнорируйте это письмо.','fallback':'Если кнопка не открывается, воспользуйтесь ссылкой ниже.','fallback_link':'Открыть ссылку','foot':'Личный блокнот для мыслей и планов','help':'Поддержка','privacy':'Конфиденциальность'},
  'en':{'subject':'Confirm your email · TO-DO Personal','label':'EMAIL CONFIRMATION','title':'Your notebook is almost ready','intro':'Confirm your email address to finish creating your TO-DO Personal account.','action':'Confirm email','after':'Once confirmed, continue signing in through the app or web version.','safety':'If you did not create an account, you can ignore this email.','fallback':'If the button does not open, use the link below.','fallback_link':'Open the link','foot':'A personal notebook for ideas and plans','help':'Support','privacy':'Privacy'}},
 'recovery':{
  'ru':{'subject':'Восстановление пароля · TO-DO Personal','label':'ВОССТАНОВЛЕНИЕ ПАРОЛЯ','title':'Задайте новый пароль','intro':'Мы получили запрос на восстановление доступа к вашему аккаунту TO-DO Personal.','action':'Создать новый пароль','after':'Задайте новый пароль на открывшемся экране. Ссылка одноразовая; если она устарела, запросите новое письмо в приложении.','safety':'Если вы не запрашивали восстановление, просто проигнорируйте письмо. Сам запрос не меняет ваш пароль.','fallback':'Если кнопка не открывается, воспользуйтесь ссылкой ниже.','fallback_link':'Открыть ссылку','foot':'Личный блокнот для мыслей и планов','help':'Поддержка','privacy':'Конфиденциальность'},
  'en':{'subject':'Reset your password · TO-DO Personal','label':'PASSWORD RESET','title':'Choose a new password','intro':'We received a request to restore access to your TO-DO Personal account.','action':'Create new password','after':'Choose your new password on the screen that opens. This link is single-use; if it has expired, request a new email in the app.','safety':'If you did not request a password reset, ignore this email. The request alone does not change your password.','fallback':'If the button does not open, use the link below.','fallback_link':'Open the link','foot':'A personal notebook for ideas and plans','help':'Support','privacy':'Privacy'}}
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
<html lang="{language}" style="color-scheme:light dark;"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><meta name="format-detection" content="telephone=no,date=no,address=no,email=no"><title>{t('subject')}</title>
<style>
:root{{color-scheme:light dark;supported-color-schemes:light dark;}}
@media (prefers-color-scheme:dark){{
 .td-mail-bg{{background-color:#000000!important;}}
 .td-mail-ink{{color:#F7F3EE!important;}}
 .td-mail-muted{{color:#C7BCC2!important;}}
 .td-mail-rule{{border-color:#353038!important;}}
 .td-mail-action{{background-color:#C38D9E!important;color:#501F3A!important;}}
}}
@media only screen and (max-width:480px){{
 .td-mail-pad{{padding-left:20px!important;padding-right:20px!important;}}
 .td-mail-title{{font-size:30px!important;}}
}}
</style></head>
<body class="td-mail-bg" bgcolor="#FFFFFF" style="margin:0;padding:0;background-color:#FFFFFF;color:#501F3A;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">{t('intro')}</div>
<table class="td-mail-bg" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background-color:#FFFFFF;"><tr><td align="center" style="padding:48px 0;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;table-layout:fixed;">
<tr><td align="center" class="td-mail-pad" style="padding:0 40px 44px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="30" height="32" align="center" valign="middle" style="width:30px;height:32px;color:#C38D9E;font:bold 29px/32px Arial,Helvetica,sans-serif;letter-spacing:-3px;">//</td><td class="td-mail-ink" style="padding-left:10px;font-size:19px;line-height:1.4;font-weight:bold;letter-spacing:.2px;color:#501F3A;">TO-DO <span style="font-weight:400;">Personal</span></td></tr></table></td></tr>
<tr><td align="center" class="td-mail-pad" style="padding:0 40px;">
<h1 class="td-mail-title td-mail-ink" style="margin:0 0 22px;font-size:36px;line-height:1.18;letter-spacing:-1px;font-weight:400;color:#501F3A;overflow-wrap:anywhere;">{t('title')}</h1>
<p class="td-mail-ink" style="margin:0 0 30px;font-size:17px;line-height:1.65;color:#501F3A;">{t('intro')}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="td-mail-action" align="center" bgcolor="#C38D9E" style="border-radius:28px;mso-padding-alt:15px 26px;"><a class="td-mail-action" href="{url}" style="display:block;padding:15px 26px;font:16px/1.4 Arial,Helvetica,sans-serif;text-decoration:none;color:#501F3A;border-radius:28px;">{t('action')}</a></td></tr></table>
<p class="td-mail-muted" style="margin:30px 0 42px;font-size:15px;line-height:1.7;color:#725562;">{t('after')}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="td-mail-rule" style="padding-top:28px;border-top:1px solid #E5D6DC;">
<p class="td-mail-muted" style="margin:0 0 22px;font-size:14px;line-height:1.7;color:#725562;">{t('safety')}</p>
<p class="td-mail-muted" style="margin:0 0 8px;font-size:13px;line-height:1.7;color:#725562;">{t('fallback')}</p>
<a class="td-mail-ink" href="{url}" style="font-size:14px;line-height:1.7;color:#501F3A;text-decoration:underline;text-underline-offset:3px;">{t('fallback_link')}</a>
</td></tr></table>
</td></tr>
<tr><td class="td-mail-pad td-mail-muted" align="center" style="padding:42px 40px 0;font-size:13px;line-height:1.9;color:#725562;">{t('foot')}<br><a class="td-mail-muted" href="mailto:support@m1strell.com" style="color:#725562;text-decoration:underline;">{t('help')}</a>&nbsp;&nbsp;&middot;&nbsp;&nbsp;<a class="td-mail-muted" href="https://todo.m1strell.com/privacy.html" style="color:#725562;text-decoration:underline;">{t('privacy')}</a></td></tr></table>
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
