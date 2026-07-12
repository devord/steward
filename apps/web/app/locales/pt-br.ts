import type { Messages } from "./en.ts"

/**
 * Português (Brasil). Mesma voz do DESIGN.md: frase em caixa de sentença
 * (primeira letra maiúscula); strings de máquina (slugs, nomes de branch,
 * cron, comandos) ficam como são; vocabulário git sem eufemismo
 * (draft → rascunho, commit → commit, PR → PR).
 */
export const ptBR: Messages = {
  "landing.tagline":
    "Um painel de widgets vivos — cada um é um relatório HTML que uma rotina agendada regenera.",
  "landing.sub": "Relatórios que se atualizam sozinhos.",
  "landing.signIn": "Entrar com GitHub",
  "landing.privacy":
    "Tudo vive em um repo privado do GitHub que é seu — o app não guarda nada.",
  "landing.deviceLink": "Entrar com um código de dispositivo",

  "device.title": "Entrar com um código de dispositivo",
  "device.intro":
    "Para builds de preview e qualquer lugar que o redirect do GitHub não alcança — você recebe um código curto para digitar no github.com.",
  "device.start": "Obter um código",
  "device.starting": "Obtendo um código…",
  "device.enterCode": "Digite este código no GitHub:",
  "device.copy": "Copiar código",
  "device.copied": "Copiado",
  "device.openLink": "Abrir a página de dispositivo do GitHub",
  "device.waiting": "Esperando você autorizar no GitHub…",
  "device.newCode": "Obter um novo código",
  "device.expired": "O código expirou antes de ser autorizado.",
  "device.denied": "A autorização foi negada no GitHub.",
  "device.error": "Algo deu errado ao acessar o GitHub. Tente de novo.",

  "header.unsynced": "Mudanças não sincronizadas",
  "header.addRoutine": "Adicionar rotina",
  "header.editLayout": "Editar",
  "header.done": "Pronto",
  "header.settings": "Ajustes",
  "header.signOut": "Sair",

  "nav.boards": "Painéis",
  "nav.openMenu": "Abrir navegação",
  "nav.collapse": "Recolher a barra lateral",
  "nav.expand": "Expandir a barra lateral",
  "nav.resize": "Redimensionar a barra lateral",
  "account.menu": "Conta",
  "account.githubAccount": "Conta do GitHub",
  "account.viewRepo": "Ver repo de dados",

  "empty.fact": "A grade está vazia",
  "empty.hint":
    "Uma rotina publica um widget aqui, num agendamento ou sob demanda.",
  "empty.cta": "Adicione sua primeira rotina",

  "offgrid.title": "Fora da grade",
  "offgrid.hint":
    "No {file} compartilhado deste repo — coloque uma, ou exclua-a do repo.",
  "offgrid.delete": "Excluir {name} do repo",
  "offgrid.edit": "Editar {name}",
  "offgrid.viewHint": "{n} fora deste painel — Editar para colocar",

  "routine.deleteTitle": "Excluir {name}?",
  "routine.deleteBody":
    "Remove a rotina do routines.yaml no próximo sync. Rotinas são compartilhadas por todos os painéis deste repo, então ela some de todos.",
  "routine.deleteConfirm": "Excluir rotina",
  "routine.edit": "Editar {name}",

  "grid.columnsLabel": "Colunas",
  "grid.width": "Largura",
  "grid.widthFixed": "Fixa",
  "grid.widthWide": "Ampla",
  "grid.density": "Densidade",
  "grid.densityCompact": "Compacta",
  "grid.densityCozy": "Confortável",
  "grid.densityRoomy": "Espaçosa",
  "grid.moveKey": "arraste",
  "grid.moveLabel": "mover",
  "grid.resizeKey": "canto",
  "grid.resizeLabel": "redimensionar",
  "grid.removeKey": "del",
  "grid.removeLabel": "remover",

  "switcher.label": "Painel",
  "switcher.personal": "Pessoal",
  "switcher.team": "Time",
  "switcher.new": "Novo painel",

  "newDash.title": "Novo painel",
  "newDash.description":
    "Uma grade nomeada de widgets — o arquivo de layout vive no repo de dados que você escolher.",
  "newDash.scope": "Onde",
  "newDash.scopePersonal": "Pessoal — seu repo de dados",
  "newDash.scopeTeam": "Time — o repo compartilhado do time",
  "newDash.name": "Nome",
  "newDash.namePlaceholder": "Ops do Time",
  "newDash.slug": "Slug",
  "newDash.slugTaken": "Já usado por outro painel",
  "newDash.create": "Criar painel",
  "newDash.creating": "Criando…",
  "newDash.exists": "Esse painel já existe no repo",

  "board.deleteDashboard": "Excluir painel",
  "board.menu": "Opções do painel",
  "board.deleteTitle": "Excluir este painel?",
  "board.deleteBody":
    "Remove {path} de {repo}. As rotinas continuam rodando — só este layout some.",
  "board.deleteConfirm": "Excluir",
  "board.deleting": "Excluindo…",
  "board.deleteConflict":
    "O painel acabou de mudar no repo — feche e tente de novo",
  "board.widgetsLoading": "Carregando widgets…",
  "board.widgetsLoaded": "Widgets carregados",

  "team.notConfigured":
    "Painéis de time não estão configurados — defina BULLETIN_TEAM_REPO no deploy.",
  "team.missingTitle": "Criar o repo do time",
  "team.missingBody":
    "Painéis de time vivem em um repo de dados compartilhado:",
  "team.missingCreate": "Criar repo do time",
  "team.missingDenied":
    "O GitHub não deixou esta conta criá-lo — peça a um admin da org para criar o repo a partir do template e recarregue.",
  "team.missingTemplate":
    "O template do repo de dados não foi encontrado — confira BULLETIN_DATA_REPO_TEMPLATE, ou peça a um admin da org para criar o repo do time à mão.",
  "team.emptyTitle": "Nenhum painel de time ainda",
  "team.emptyBody":
    "Crie o primeiro — todo mundo com acesso ao repo do time vai vê-lo.",
  "team.emptyCta": "Novo painel de time",
  "team.back": "Voltar para o seu painel",

  "widget.stale": "Atrasado",
  "widget.staleTitle": "Atrasado em relação ao agendamento",
  "widget.ran": "Rodou {ago}",
  "widget.never": "Nunca rodou",
  "widget.manual": "Manual",
  "widget.manualTitle": "Roda sob demanda — sem agendamento",
  "widget.update": "Atualizar {name} agora",
  "widget.updateShort": "Atualizar",
  "widget.updateRequested": "Execução solicitada — atualize em um minuto",
  "widget.updateNoTrigger":
    "Sem gatilho de API para esta rotina — configure com pnpm routine:trigger {slug}",
  "widget.updateFailed": "A solicitação falhou — tente de novo",
  "widget.copyCommand": "Copiar o comando de terminal que roda {name}",
  "widget.copied":
    "Comando copiado — rode a partir do seu checkout do Bulletin",
  "widget.unreachable":
    "GitHub inacessível — tentará novamente na próxima atualização",
  "widget.disabled": "Rotina desativada",
  "widget.running": "Rodando",
  "widget.runningSince": "Rodando — começou {ago}",
  "widget.draftHint": "No seu rascunho — sincronize para commitar",
  "widget.needsTriggerHint":
    "Precisa de um gatilho de API para que a atualização funcione — no seu checkout do Bulletin:",
  "widget.awaitEnact": "Commitado — ative no seu checkout do Bulletin:",
  "widget.awaitLocalManual": "Roda na sua máquina — rode quando precisar:",
  "widget.readyManual": "Pronto — aperte atualizar para rodar",
  "widget.runNow": "Rodar agora",
  "widget.runFirst": "Rodar primeira atualização",
  "widget.orWaitSchedule": "ou aguarde o agendamento ({cron})",
  "widget.firstRunSchedule":
    "A primeira execução acontece no agendamento ({cron})",
  "widget.runnerNote":
    "{runner} precisa rodar isto — o recurso na nuvem é dele",
  "widget.copyCmd": "Copiar comando",
  "widget.moveLeft": "Mover para a esquerda",
  "widget.moveRight": "Mover para a direita",
  "widget.moveUp": "Mover para cima",
  "widget.moveDown": "Mover para baixo",
  "widget.columns": "Colunas",
  "widget.rows": "Linhas",
  "widget.remove": "Remover {name} da grade",
  "widget.expand": "Expandir {name} em tela cheia",
  "widget.expandShort": "Expandir",
  "widget.collapse": "Fechar",

  "time.now": "agora mesmo",
  "time.minutes": "há {n}m",
  "time.hours": "há {n}h",
  "time.days": "há {n}d",

  "dialog.title": "Adicionar uma rotina",
  "dialog.description":
    "Descreva o que o widget mostra; uma rotina o mantém fresco num agendamento ou sob demanda.",
  "dialog.editTitle": "Editar rotina",
  "dialog.editDescription":
    "Mude como esta rotina roda. O slug é fixo — exclua e adicione de novo para renomear. Posição e tamanho são definidos na grade.",
  "dialog.prompt": "O que este widget deve mostrar?",
  "dialog.promptPlaceholder":
    "PRs abertos nos nossos repos, agrupados por revisor…",
  "dialog.template": "Template",
  "dialog.customCard": "Descreva você mesmo — sua descrição é o brief",
  "dialog.sourcePrivate": "Privado",
  "dialog.sourceTeam": "Time",
  "dialog.sourceBuiltin": "Nativo",
  "dialog.name": "Nome",
  "dialog.namePlaceholder": "Plano do Dia",
  "dialog.slug": "Slug",
  "dialog.slugTaken": "Já usado por outra rotina",
  "dialog.schedule": "Agendamento",
  "dialog.suggested": "Sugerido — {cron}",
  "dialog.customCron": "Cron personalizado…",
  "dialog.customCronLabel": "Expressão cron personalizada",
  "dialog.presetHourly": "A cada hora",
  "dialog.presetEvery4h": "A cada 4 horas",
  "dialog.presetDaily8": "Diário às 8:00",
  "dialog.presetWeekdays9": "Dias úteis às 9:00",
  "dialog.presetWeeklyMon9": "Semanal, segunda às 9:00",
  "dialog.manual": "Manual — roda sob demanda",
  "dialog.host": "Roda em",
  "dialog.hostCloud": "Nuvem — uma rotina do Claude",
  "dialog.hostLocal": "Local — sua máquina",
  "dialog.hostCloudShort": "Nuvem",
  "dialog.hostLocalShort": "Local",
  "dialog.hostLocalHint":
    "Rotinas locais rodam na sua máquina: as agendadas são ativadas via pnpm routines:sync; as manuais rodam com pnpm routine <slug>",
  "dialog.manualCloudHint":
    "Rotinas manuais na nuvem disparam pelo botão de atualizar do widget via gatilho de API — pnpm routines:sync configura",
  "dialog.runnerHint":
    "O recurso na nuvem roda na conta Claude de {login} — depois do commit, rode pnpm routines:sync contra o repo do time",
  "dialog.cancel": "Cancelar",
  "dialog.add": "Adicionar ao rascunho",
  "dialog.save": "Salvar mudanças",
  "dialog.next": "Avançar",
  "dialog.back": "Voltar",
  "dialog.stepLabel": "Etapa {n} de 2",
  "dialog.customHint": "executa sua descrição como está escrita",
  "dialog.promote": "Salvar como template",
  "dialog.promoteHint":
    "Copie e rode a partir do seu checkout do repo de dados — o Claude generaliza esta rotina em templates/routines/ e a aponta para lá",
  "dialog.required": "Obrigatório",
  "dialog.advanced": "Avançado",
  "dialog.extraRepos": "Repos extras de origem",
  "dialog.extraReposHint":
    "Repos que a execução na nuvem pode ler além dos repos de contrato e de dados — repos que um template observa são anexados automaticamente",
  "dialog.connectors": "Connectors",
  "dialog.connectorsHint":
    "Connectors MCP que a execução pode usar, pelo nome da conta — ela não recebe nenhum a menos que listado",
  "dialog.repoEmpty": "Digite owner/repo — sugestões vêm dos seus repos",
  "dialog.connectorEmpty": "Digite o nome de conta de um connector",
  "dialog.addToken": 'Adicionar "{value}"',
  "dialog.removeToken": "Remover {value}",

  "sync.title": "Sincronizar mudanças",
  "sync.description":
    "Persiste o rascunho no seu repo de dados — até lá ele só existe neste navegador.",
  "sync.prOpened": "Pull request aberto",
  "sync.nothing1": "O rascunho é igual ao que está na",
  "sync.nothing2": "— nada para sincronizar.",
  "sync.baseMoved": "A base mudou",
  "sync.baseMovedBody":
    "{files} mudou no repo desde que este rascunho foi criado. Mantenha a sua versão para sobrescrever a cópia do repo, ou pegue a do servidor e descarte seu rascunho.",
  "sync.and": " e ",
  "sync.keepMine": "Manter minha versão",
  "sync.takeServer": "Pegar versão do servidor",
  "sync.nextSteps": "Commitado — agora ative suas novas rotinas",
  "sync.nextStepsBody":
    "Salvo no repo, mas uma rotina só roda depois de ativada. No seu checkout do Bulletin:",
  "sync.done": "Concluído",
  "sync.asPr": "Abrir um PR em vez disso",
  "sync.discard": "Descartar rascunho",
  "sync.commit": "Commit na main",
  "sync.openPr": "Abrir PR",
  "sync.syncing": "Sincronizando…",

  "setup.title": "Crie seu repo do painel",
  "setup.hi1": "Oi",
  "setup.hi2":
    "— o Bulletin guarda tudo o que sabe sobre você em um repo privado do GitHub:",
  "setup.bulletMain":
    "{branch} guarda a config — quais rotinas rodam, e o layout da grade",
  "setup.bulletArtifacts": "Um branch {branch} guarda o que elas publicam",
  "setup.bulletPrivate":
    "Privado: só você (e colaboradores que convidar) podem ler",
  "setup.create": "Criar repo",
  "setup.creating": "Criando…",
  "setup.wrongAccount":
    "Tem certeza de que esse repo já existe? Esta verificação roda ao vivo a cada acesso, então não está desatualizada — o mais provável é que você esteja logado em uma conta do GitHub diferente da dona do repo. Confira o login acima e saia para trocar.",
  "setup.teamLink": "Ir para os painéis do time",

  "settings.title": "Ajustes",
  "settings.back": "Voltar ao painel",
  "settings.appearance": "Aparência",
  "settings.mode": "Modo",
  "settings.modeAuto": "Auto",
  "settings.modeLight": "Claro",
  "settings.modeDark": "Escuro",
  "settings.modeHintSystem": "Segue o sistema — claro de dia, escuro à noite",
  "settings.modeHintLight": "Sempre o tema claro",
  "settings.modeHintDark": "Sempre o tema escuro",
  "settings.theme": "Tema",
  "settings.themeHint": "Uma escolha preenche o claro e o escuro de uma vez",
  "settings.mix": "Misturar claro & escuro separadamente",
  "settings.mixLight": "Claro",
  "settings.mixDark": "Escuro",
  "settings.notApplied":
    "Não é o que está na tela agora — o modo está fixado no outro slot",
  "settings.language": "Idioma",
  "settings.languageHint":
    "Só o chrome — widgets falam o que a rotina deles escrever",
  "settings.saved":
    "Aparência fica salva neste dispositivo; idioma viaja como cookie",

  "error.title": "Erro",
  "error.notFound": "A página pedida não foi encontrada.",
  "error.generic": "Ocorreu um erro inesperado.",
}
