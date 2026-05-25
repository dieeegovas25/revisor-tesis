import { Controller, Post, Body, Param } from '@nestjs/common';
import { OrcidService } from './orcid.service';

@Controller('orcid')
export class OrcidController {
    constructor(private readonly orcidService: OrcidService) { }

    // Esta es la ruta que tu frontend va a llamar
    @Post('verify/:userId')
    async verifyOrcid(
        @Param('userId') userId: string,
        @Body('orcidId') orcidId: string,
        @Body('thesisTopic') thesisTopic: string,
    ) {
        return this.orcidService.verifyAdvisorExpertise(userId, orcidId, thesisTopic);
    }
}