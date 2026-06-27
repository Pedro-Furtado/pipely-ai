import type { ChatCompletionTool } from "openai/resources/chat/completions.js";

export const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "send_whatsapp_message",
      description:
        "Envia mensagens via WhatsApp para o membro responsavel. " +
        "Cada item do array 'messages' sera enviado como mensagem separada com delay de digitacao entre elas, " +
        "simulando uma conversa natural. Use formatacao WhatsApp: *negrito*, _italico_, ~riscado~. " +
        "Se o membro tem varias tarefas, agrupe todas em uma unica chamada desta tool. " +
        "Separe em 2-4 mensagens curtas para parecer natural.",
      parameters: {
        type: "object",
        properties: {
          remote_jid: {
            type: "string",
            description: "O remoteJid do destinatario (ex: 5511999999999@s.whatsapp.net)",
          },
          messages: {
            type: "array",
            items: { type: "string" },
            description: "Array de mensagens a serem enviadas sequencialmente com delay entre elas. Max 4.",
          },
        },
        required: ["remote_jid", "messages"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_task",
      description:
        "Move uma tarefa para outro bloco do pipeline. " +
        "Use quando o tempo de auto-avanco expirou ou quando o roteamento condicional determina o proximo bloco.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "O ID da tarefa a ser movida.",
          },
          target_block_id: {
            type: "string",
            description: "O ID do bloco de destino.",
          },
          reason: {
            type: "string",
            description: "Motivo da movimentacao (para log).",
          },
        },
        required: ["task_id", "target_block_id", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_notification",
      description:
        "Cria uma notificacao na plataforma para um usuario. " +
        "Use para alertar sobre eventos importantes como tarefas atrasadas, prazos vencidos, etc.",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "string",
            description: "O ID do usuario que recebera a notificacao.",
          },
          title: {
            type: "string",
            description: "Titulo da notificacao.",
          },
          message: {
            type: "string",
            description: "Mensagem da notificacao.",
          },
        },
        required: ["user_id", "title", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task_status",
      description:
        "Atualiza o status de uma tarefa (todo, in_progress, done). " +
        "SOMENTE use se o bloco tiver a config 'auto_status' habilitada. " +
        "Nunca mude o status por conta propria sem essa configuracao.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "O ID da tarefa.",
          },
          status: {
            type: "string",
            enum: ["todo", "in_progress", "done"],
            description: "Novo status da tarefa.",
          },
        },
        required: ["task_id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "retry_task",
      description:
        "Agenda uma tarefa para ser reprocessada pelo agente apos um tempo configurado. " +
        "Use quando o roteamento condicional indica retry (repetir) em vez de mover. " +
        "Exemplo: responsavel disse que ainda nao comecou — reagendar para perguntar de novo depois.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "O ID da tarefa a ser reagendada.",
          },
          retry_minutes: {
            type: "number",
            description: "Quantos minutos esperar antes de reprocessar a tarefa.",
          },
          reason: {
            type: "string",
            description: "Motivo do reagendamento (para log).",
          },
        },
        required: ["task_id", "retry_minutes", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_whatsapp_buttons",
      description:
        "Envia uma mensagem com botoes interativos no WhatsApp. " +
        "O usuario pode clicar em um dos botoes para responder rapidamente. " +
        "Use quando quiser dar opcoes claras ao responsavel (ex: 'Sim' / 'Nao' / 'Depois'). " +
        "Maximo 3 botoes.",
      parameters: {
        type: "object",
        properties: {
          remote_jid: {
            type: "string",
            description: "O remoteJid do destinatario (ex: 5511999999999@s.whatsapp.net)",
          },
          text: {
            type: "string",
            description: "Texto principal da mensagem.",
          },
          footer: {
            type: "string",
            description: "Texto do rodape (opcional, menor e cinza).",
          },
          buttons: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "ID unico do botao." },
                text: { type: "string", description: "Texto exibido no botao." },
              },
              required: ["id", "text"],
            },
            description: "Array de botoes (max 3). Cada botao tem id e text.",
          },
        },
        required: ["remote_jid", "text", "buttons"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_whatsapp_poll",
      description:
        "Envia uma enquete (poll) no WhatsApp. " +
        "O usuario pode votar em uma ou mais opcoes. " +
        "Use quando quiser coletar opiniao ou fazer o responsavel escolher entre varias opcoes. " +
        "Maximo 12 opcoes.",
      parameters: {
        type: "object",
        properties: {
          remote_jid: {
            type: "string",
            description: "O remoteJid do destinatario (ex: 5511999999999@s.whatsapp.net)",
          },
          question: {
            type: "string",
            description: "Pergunta da enquete.",
          },
          options: {
            type: "array",
            items: { type: "string" },
            description: "Array de opcoes da enquete (min 2, max 12).",
          },
          max_answers: {
            type: "number",
            description: "Numero maximo de respostas que o usuario pode selecionar. Default: 1.",
          },
        },
        required: ["remote_jid", "question", "options"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_whatsapp_list",
      description:
        "Envia uma mensagem com lista de opcoes no WhatsApp. " +
        "O usuario clica no botao para ver as opcoes organizadas em secoes. " +
        "Use quando tiver muitas opcoes (mais de 3) para o responsavel escolher.",
      parameters: {
        type: "object",
        properties: {
          remote_jid: {
            type: "string",
            description: "O remoteJid do destinatario (ex: 5511999999999@s.whatsapp.net)",
          },
          title: {
            type: "string",
            description: "Titulo da mensagem.",
          },
          description: {
            type: "string",
            description: "Descricao da mensagem.",
          },
          button_text: {
            type: "string",
            description: "Texto do botao que abre a lista (ex: 'Ver opcoes').",
          },
          sections: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Titulo da secao." },
                rows: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string", description: "ID unico da opcao." },
                      title: { type: "string", description: "Titulo da opcao." },
                      description: { type: "string", description: "Descricao da opcao." },
                    },
                    required: ["id", "title"],
                  },
                },
              },
              required: ["title", "rows"],
            },
            description: "Secoes da lista, cada uma com titulo e opcoes.",
          },
        },
        required: ["remote_jid", "title", "description", "button_text", "sections"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_action",
      description:
        "Registra uma acao no log do sistema. Use para documentar decisoes tomadas pelo agente.",
      parameters: {
        type: "object",
        properties: {
          context: {
            type: "string",
            description: "Contexto da acao (ex: PIPELINE, TASK, NOTIFICATION).",
          },
          message: {
            type: "string",
            description: "Descricao da acao.",
          },
        },
        required: ["context", "message"],
      },
    },
  },
];
