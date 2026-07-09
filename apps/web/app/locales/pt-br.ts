import type { Messages } from "./en.ts"

/**
 * Português (Brasil). Mesma voz do DESIGN.md: minúsculas onde soa natural,
 * vocabulário git usado sem eufemismo (draft → rascunho, commit → commit,
 * PR → PR — termos que o git tornaria visíveis ficam como são).
 */
export const ptBR: Messages = {
  "landing.tagline":
    "Um painel de widgets vivos — cada um é um relatório HTML que uma rotina agendada regenera.",
  "landing.sub": "Relatórios que se atualizam sozinhos.",
  "landing.signIn": "Entrar com GitHub",
  "landing.privacy":
    "Tudo vive em um repo privado do GitHub que é seu — o app não guarda nada.",

  "header.unsynced": "mudanças não sincronizadas",
  "header.addRoutine": "adicionar rotina",
  "header.editLayout": "editar layout",
  "header.done": "pronto",
  "header.settings": "ajustes",
  "header.signOut": "sair",

  "empty.fact": "a grade está vazia",
  "empty.hint":
    "Uma rotina executa uma skill num agendamento e publica um widget aqui.",
  "empty.cta": "Adicione sua primeira rotina",

  "offgrid.title": "fora da grade",

  "widget.stale": "atrasado",
  "widget.staleTitle": "atrasado em relação ao agendamento",
  "widget.ran": "rodou {ago}",
  "widget.never": "nunca rodou",
  "widget.unreachable": "github inacessível — tenta de novo no próximo refresh",
  "widget.waiting": "esperando a primeira execução —",
  "widget.disabled": "rotina desativada",
  "widget.moveLeft": "mover para a esquerda",
  "widget.moveRight": "mover para a direita",
  "widget.moveUp": "mover para cima",
  "widget.moveDown": "mover para baixo",
  "widget.columns": "colunas",
  "widget.rows": "linhas",
  "widget.remove": "remover {name} da grade",

  "time.now": "agora mesmo",
  "time.minutes": "há {n}m",
  "time.hours": "há {n}h",
  "time.days": "há {n}d",

  "dialog.title": "Adicionar uma rotina",
  "dialog.description":
    "Uma skill do catálogo, executada num agendamento, renderizando um widget.",
  "dialog.skill": "Skill",
  "dialog.catalogEmpty1":
    "O catálogo está vazio — nenhuma skill publicou um bloco",
  "dialog.catalogEmpty2":
    "ainda. Adicione um a uma skill no repo compartilhado e rode",
  "dialog.name": "Nome",
  "dialog.namePlaceholder": "Plano do Dia",
  "dialog.slug": "Slug",
  "dialog.slugTaken": "já usado por outra rotina",
  "dialog.size": "Tamanho do widget",
  "dialog.schedule": "Agendamento",
  "dialog.suggested": "sugerido — {cron}",
  "dialog.customCron": "cron personalizado…",
  "dialog.customCronLabel": "expressão cron personalizada",
  "dialog.presetHourly": "a cada hora",
  "dialog.presetEvery4h": "a cada 4 horas",
  "dialog.presetDaily8": "diário às 8:00",
  "dialog.presetWeekdays9": "dias úteis às 9:00",
  "dialog.presetWeeklyMon9": "semanal, segunda às 9:00",
  "dialog.instructions": "Instruções",
  "dialog.instructionsHint": "(opcional — passadas à skill em toda execução)",
  "dialog.instructionsPlaceholder":
    "Quais projetos importam, o que ignorar, tom…",
  "dialog.cancel": "Cancelar",
  "dialog.add": "Adicionar ao rascunho",

  "sync.title": "Sincronizar mudanças",
  "sync.description":
    "Persiste o rascunho no seu repo de dados — até lá ele só existe neste navegador.",
  "sync.prOpened": "Pull request aberto",
  "sync.nothing1": "O rascunho é igual ao que está na",
  "sync.nothing2": "— nada para sincronizar.",
  "sync.baseMoved": "A base mudou",
  "sync.baseMovedBody":
    "{files} mudou no repo desde que este rascunho foi criado. Reaplique o rascunho sobre a base nova e revise o diff de novo.",
  "sync.and": " e ",
  "sync.reapply": "Reaplicar na base nova",
  "sync.asPr": "abrir um PR em vez disso",
  "sync.discard": "Descartar rascunho",
  "sync.commit": "Commit na main",
  "sync.openPr": "Abrir PR",
  "sync.syncing": "sincronizando…",

  "setup.title": "Crie seu repo do painel",
  "setup.hi1": "Oi",
  "setup.hi2":
    "— o Bulletin guarda tudo o que sabe sobre você em um repo privado do GitHub:",
  "setup.bulletMain":
    "{branch} guarda a config — quais rotinas rodam, e o layout da grade",
  "setup.bulletArtifacts": "um branch {branch} guarda o que elas publicam",
  "setup.bulletPrivate":
    "privado: só você (e colaboradores que convidar) podem ler",
  "setup.create": "Criar repo",
  "setup.creating": "criando…",

  "settings.title": "ajustes",
  "settings.back": "voltar ao painel",
  "settings.appearance": "aparência",
  "settings.mode": "modo",
  "settings.modeAuto": "auto",
  "settings.modeLight": "claro",
  "settings.modeDark": "escuro",
  "settings.modeHintSystem": "segue o sistema — claro de dia, escuro à noite",
  "settings.modeHintLight": "sempre o tema claro",
  "settings.modeHintDark": "sempre o tema escuro",
  "settings.theme": "tema",
  "settings.themeHint": "uma escolha preenche o claro e o escuro de uma vez",
  "settings.mix": "misturar claro & escuro separadamente",
  "settings.mixLight": "claro",
  "settings.mixDark": "escuro",
  "settings.notApplied":
    "não é o que está na tela agora — o modo está fixado no outro slot",
  "settings.language": "idioma",
  "settings.languageHint":
    "só o chrome — widgets falam o que a rotina deles escrever",
  "settings.saved":
    "aparência fica salva neste dispositivo; idioma viaja como cookie",

  "error.title": "Erro",
  "error.notFound": "A página pedida não foi encontrada.",
  "error.generic": "Ocorreu um erro inesperado.",
}
