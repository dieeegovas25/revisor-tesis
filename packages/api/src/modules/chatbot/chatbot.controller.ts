import { Controller, Post, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsNotEmpty, IsString } from 'class-validator';
import { ChatbotService } from './chatbot.service';

class ChatbotQueryDto {
  @IsString({ message: 'El campo "message" debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El campo "message" no puede estar vacío.' })
  message!: string;
}

@Controller('chatbot')
@UseGuards(AuthGuard('jwt'))
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('query')
  async query(@Body() body: ChatbotQueryDto) {
    if (!body || !body.message || typeof body.message !== 'string') {
      throw new BadRequestException('El campo "message" es requerido y debe ser una cadena de texto.');
    }

    const reply = await this.chatbotService.query(body.message.trim());
    return {
      success: true,
      reply,
    };
  }
}
