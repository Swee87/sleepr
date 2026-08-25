// apps/reservations/src/reservation.service.ts
import {
  Inject,
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { PAYMENTS_SERVICE } from '@app/common';
import { UserDto } from '@app/common';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { ReservationRepository } from './reservation.repository';

@Injectable()
export class ReservationService {
  private readonly logger = new Logger(ReservationService.name);

  constructor(
    private readonly reservationRepository: ReservationRepository,
    @Inject(PAYMENTS_SERVICE)
    private readonly paymentsClient: ClientProxy,
  ) { }

  async create(createReservationDto: CreateReservationDto, user: UserDto) {
    // log what we're sending to payments service
    this.logger.log(`Creating reservation for user: ${JSON.stringify({
      userId: user._id.toString(),
      email: user.email,
      amount: createReservationDto.amount,
    })}`);

    let payment: any;
    try {
      payment = await firstValueFrom(
        this.paymentsClient.send('create_charge', {
          userId: user._id.toString(),
          email: user.email,
          amount: createReservationDto.amount,
          currency: 'NGN',
          channels: ['card', 'bank_transfer', 'ussd', 'bank'],
        }),
      );

      this.logger.log(`Payment response: ${JSON.stringify(payment)}`);

    } catch (error) {
      // log the REAL error instead of hiding it
      this.logger.error(`Payment TCP error: ${error.message}`, error.stack);
      throw new BadRequestException(`Payment failed: ${error.message}`);
    }

    if (!payment?.paymentUrl) {
      // log what we actually received
      this.logger.error(`No paymentUrl received. Full response: ${JSON.stringify(payment)}`);
      throw new BadRequestException('Payment initialization failed');
    }

    const reservation = await this.reservationRepository.create({
      ...createReservationDto,
      timeStamp: new Date(),
      userId: user._id.toString(),
      paymentId: payment.paymentId,
      paymentStatus: 'PENDING',
    });

    return {
      reservation,
      paymentUrl: payment.paymentUrl,
      paymentId: payment.paymentId,
      reference: payment.reference,
    };
  }

  async findAll(userId: string) {
    return this.reservationRepository.find({ userId });
  }

  async findOne(_id: string, userId: string) {
    const reservation = await this.reservationRepository.findOne({
      _id,
      userId,
    });
    if (!reservation) throw new NotFoundException('Reservation not found');
    return reservation;
  }

  async update(
    _id: string,
    updateReservationDto: UpdateReservationDto,
    userId: string,
  ) {
    const reservation = await this.reservationRepository.findOne({
      _id,
      userId,
    });
    if (!reservation) throw new UnauthorizedException('Unauthorized');

    return this.reservationRepository.findOneAndUpdate(
      { _id },
      { $set: updateReservationDto },
    );
  }

  async remove(_id: string, userId: string) {
    const reservation = await this.reservationRepository.findOne({
      _id,
      userId,
    });
    if (!reservation) throw new UnauthorizedException('Unauthorized');

    return this.reservationRepository.findOneAndDelete({ _id });
  }
}


// import { Inject, Injectable } from '@nestjs/common';
// import { PAYMENTS_SERVICE } from '@app/common';
// import { CreateReservationDto } from './dto/create-reservation.dto';
// import { UpdateReservationDto } from './dto/update-reservation.dto';
// import { ReservationRepository } from './reservation.repository';
// import { ClientProxy } from '@nestjs/microservices';

// @Injectable()
// export class ReservationService {
//   constructor(private readonly reservationRepository: ReservationRepository, @Inject(PAYMENTS_SERVICE) private readonly paymentsService: ClientProxy) { }
//   async create(createReservationDto: CreateReservationDto, userId: string) {
//     return this.reservationRepository.create({
//       ...createReservationDto,
//       timeStamp: new Date(),
//       userId,
//     });
//   }

//   async findAll() {
//     return this.reservationRepository.find({});
//   }

//   async findOne(_id: string) {
//     return this.reservationRepository.findOne({ _id });
//   }

//   async update(_id: string, updateReservationDto: UpdateReservationDto) {
//     return this.reservationRepository.findOneAndUpdate({ _id }, { $set: updateReservationDto });
//   }

//   async remove(_id: string) {
//     return this.reservationRepository.findOneAndDelete({ _id });
//   }
// }
