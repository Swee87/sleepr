import { Injectable, Logger } from "@nestjs/common";
import { AbstractRepository } from "@app/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { ReservationDocument } from "./models/reservation.schema";

@Injectable()
export class ReservationRepository extends AbstractRepository<ReservationDocument> {
    protected readonly logger = new Logger(ReservationRepository.name);

    constructor(
        @InjectModel(ReservationDocument.name)
        model: Model<ReservationDocument>,
    ) {
        super(model);
    }
}
