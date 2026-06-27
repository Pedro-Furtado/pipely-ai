export interface PipelineTemplate {
  id: string
  name: string
  description: string
  icon: string
  phases: {
    name: string
    color: string
    position: number
    blocks: {
      name: string
      slug: string
      blockType: string
      config: Record<string, unknown>
      position: number
      isLocked: boolean
    }[]
  }[]
}

export const pipelineTemplates: PipelineTemplate[] = [
  {
    id: 'basico',
    name: 'Basico',
    description: 'Gestao simples de tarefas com acompanhamento automatico via WhatsApp.',
    icon: 'clipboard',
    phases: [
      {
        name: 'Pedidos',
        color: 'blue',
        position: 0,
        blocks: [
          {
            name: 'Novo Pedido',
            slug: 'novo_pedido',
            blockType: 'message',
            config: {
              prompt: 'Avise ao responsavel sobre a nova tarefa e pergunte se ele pode fazer agora',
              branches: [
                { label: 'Adiado', nextSlug: '__adiado__', condition: 'Responsavel nao pode fazer agora' },
                { label: 'Tarefa iniciada', nextSlug: '__tarefa_iniciada__', condition: 'Responsavel pode iniciar a tarefa agora' },
              ],
            },
            position: 0,
            isLocked: false,
          },
          {
            name: 'Adiado',
            slug: 'adiado',
            blockType: 'message',
            config: { delay_minutes: 60, next_block_id: '__novo_pedido__' },
            position: 1,
            isLocked: false,
          },
        ],
      },
      {
        name: 'Tarefa',
        color: 'purple',
        position: 1,
        blocks: [
          {
            name: 'Tarefa Iniciada',
            slug: 'tarefa_iniciada',
            blockType: 'message',
            config: {
              prompt: 'Pergunte se a tarefa ja foi finalizada',
              auto_status: 'in_progress',
              msg_delay_minutes: 120,
              branches: [
                { label: 'Tarefa finalizada', nextSlug: '__tarefa_finalizada__', condition: 'Tarefa foi finalizada' },
                { label: 'Ainda nao', nextSlug: '', condition: 'Ainda nao finalizou a tarefa', retry_minutes: 60 },
              ],
            },
            position: 0,
            isLocked: false,
          },
          {
            name: 'Tarefa Finalizada',
            slug: 'tarefa_finalizada',
            blockType: 'message',
            config: { auto_status: 'done' },
            position: 1,
            isLocked: false,
          },
        ],
      },
    ],
  },
  {
    id: 'projeto',
    name: 'Projeto',
    description: 'Gerencie projetos com briefing, execucao, revisao e entrega.',
    icon: 'folder-kanban',
    phases: [
      {
        name: 'Briefing',
        color: 'blue',
        position: 0,
        blocks: [
          {
            name: 'Novo Briefing',
            slug: 'novo_briefing',
            blockType: 'message',
            config: {
              prompt: 'Envie os detalhes do projeto ao responsavel e confirme se ele entendeu o escopo',
              branches: [
                { label: 'Briefing aceito', nextSlug: '__em_execucao__', condition: 'Responsavel confirmou que entendeu o briefing' },
              ],
              no_reply_minutes: 120,
              no_reply_block_id: '__sem_resposta__',
            },
            position: 0,
            isLocked: false,
          },
          {
            name: 'Sem Resposta',
            slug: 'sem_resposta',
            blockType: 'message',
            config: {
              prompt: 'O responsavel nao respondeu ao briefing. Reenvie de forma resumida e peca confirmacao',
              branches: [
                { label: 'Respondeu', nextSlug: '__em_execucao__', condition: 'Responsavel confirmou que entendeu' },
              ],
            },
            position: 1,
            isLocked: false,
          },
        ],
      },
      {
        name: 'Execucao',
        color: 'purple',
        position: 1,
        blocks: [
          {
            name: 'Em Execucao',
            slug: 'em_execucao',
            blockType: 'message',
            config: {
              prompt: 'Pergunte como esta o andamento e se precisa de algo',
              auto_status: 'in_progress',
              msg_delay_minutes: 480,
              branches: [
                { label: 'Concluiu', nextSlug: '__em_revisao__', condition: 'Responsavel finalizou a execucao' },
                { label: 'Em andamento', nextSlug: '', condition: 'Ainda esta trabalhando', retry_minutes: 480 },
              ],
            },
            position: 0,
            isLocked: false,
          },
        ],
      },
      {
        name: 'Revisao',
        color: 'amber',
        position: 2,
        blocks: [
          {
            name: 'Em Revisao',
            slug: 'em_revisao',
            blockType: 'message',
            config: {
              prompt: 'Avise que a entrega esta em revisao e que em breve tera retorno',
            },
            position: 0,
            isLocked: false,
          },
          {
            name: 'Ajustes',
            slug: 'ajustes',
            blockType: 'message',
            config: {
              prompt: 'Informe os pontos de ajuste e peca para corrigir',
              branches: [
                { label: 'Corrigido', nextSlug: '__em_revisao__', condition: 'Responsavel finalizou as correcoes' },
              ],
            },
            position: 1,
            isLocked: false,
          },
        ],
      },
      {
        name: 'Entrega',
        color: 'green',
        position: 3,
        blocks: [
          {
            name: 'Aprovado',
            slug: 'aprovado',
            blockType: 'message',
            config: {
              prompt: 'Parabens! Avise que o projeto foi aprovado e agradeca pelo trabalho',
              auto_status: 'done',
            },
            position: 0,
            isLocked: false,
          },
        ],
      },
    ],
  },
  {
    id: 'demandas',
    name: 'Demandas',
    description: 'Solicitacoes internas entre equipes com triagem e acompanhamento.',
    icon: 'inbox',
    phases: [
      {
        name: 'Entrada',
        color: 'blue',
        position: 0,
        blocks: [
          {
            name: 'Nova Demanda',
            slug: 'nova_demanda',
            blockType: 'message',
            config: {
              prompt: 'Notifique o responsavel sobre a nova demanda com os detalhes e peca confirmacao de recebimento',
              branches: [
                { label: 'Aceita', nextSlug: '__em_andamento__', condition: 'Responsavel aceitou a demanda' },
                { label: 'Recusada', nextSlug: '__recusada__', condition: 'Responsavel recusou ou nao pode atender' },
              ],
              no_reply_minutes: 60,
              no_reply_block_id: '__nova_demanda__',
            },
            position: 0,
            isLocked: false,
          },
          {
            name: 'Recusada',
            slug: 'recusada',
            blockType: 'message',
            config: {
              prompt: 'Informe que a demanda foi recusada e pergunte o motivo',
            },
            position: 1,
            isLocked: false,
          },
        ],
      },
      {
        name: 'Andamento',
        color: 'purple',
        position: 1,
        blocks: [
          {
            name: 'Em Andamento',
            slug: 'em_andamento',
            blockType: 'message',
            config: {
              prompt: 'Pergunte como esta o progresso da demanda',
              auto_status: 'in_progress',
              msg_delay_minutes: 240,
              branches: [
                { label: 'Finalizada', nextSlug: '__concluida__', condition: 'Demanda foi concluida' },
                { label: 'Em progresso', nextSlug: '', condition: 'Ainda esta trabalhando', retry_minutes: 240 },
              ],
            },
            position: 0,
            isLocked: false,
          },
        ],
      },
      {
        name: 'Conclusao',
        color: 'green',
        position: 2,
        blocks: [
          {
            name: 'Concluida',
            slug: 'concluida',
            blockType: 'message',
            config: {
              prompt: 'Avise que a demanda foi marcada como concluida e agradeca',
              auto_status: 'done',
            },
            position: 0,
            isLocked: false,
          },
        ],
      },
    ],
  },
  {
    id: 'conteudo',
    name: 'Conteudo',
    description: 'Producao de conteudo com briefing, criacao, revisao e publicacao.',
    icon: 'pen-tool',
    phases: [
      {
        name: 'Briefing',
        color: 'blue',
        position: 0,
        blocks: [
          {
            name: 'Novo Pedido',
            slug: 'novo_pedido',
            blockType: 'message',
            config: {
              prompt: 'Envie o briefing do conteudo ao responsavel e confirme se ele entendeu',
              branches: [
                { label: 'Entendeu', nextSlug: '__em_producao__', condition: 'Responsavel confirmou que entendeu o briefing' },
              ],
              no_reply_minutes: 60,
              no_reply_block_id: '__novo_pedido__',
            },
            position: 0,
            isLocked: false,
          },
        ],
      },
      {
        name: 'Producao',
        color: 'purple',
        position: 1,
        blocks: [
          {
            name: 'Em Producao',
            slug: 'em_producao',
            blockType: 'message',
            config: {
              prompt: 'Pergunte se ja terminou de produzir o conteudo',
              auto_status: 'in_progress',
              msg_delay_minutes: 1440,
              branches: [
                { label: 'Entregue', nextSlug: '__em_revisao__', condition: 'Responsavel entregou o conteudo' },
                { label: 'Precisa de mais tempo', nextSlug: '', condition: 'Ainda nao terminou', retry_minutes: 1440 },
              ],
            },
            position: 0,
            isLocked: false,
          },
        ],
      },
      {
        name: 'Revisao',
        color: 'amber',
        position: 2,
        blocks: [
          {
            name: 'Em Revisao',
            slug: 'em_revisao',
            blockType: 'message',
            config: {
              prompt: 'Avise que o conteudo esta em revisao',
            },
            position: 0,
            isLocked: false,
          },
          {
            name: 'Correcoes',
            slug: 'correcoes',
            blockType: 'message',
            config: {
              prompt: 'Informe os ajustes necessarios e peca para corrigir',
              branches: [
                { label: 'Corrigido', nextSlug: '__em_revisao__', condition: 'Responsavel corrigiu' },
              ],
            },
            position: 1,
            isLocked: false,
          },
        ],
      },
      {
        name: 'Publicacao',
        color: 'green',
        position: 3,
        blocks: [
          {
            name: 'Aprovado',
            slug: 'aprovado',
            blockType: 'message',
            config: {
              prompt: 'Avise que o conteudo foi aprovado e agradeca pelo trabalho',
              auto_status: 'done',
            },
            position: 0,
            isLocked: false,
          },
        ],
      },
    ],
  },
]
