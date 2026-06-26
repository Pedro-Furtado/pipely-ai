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
