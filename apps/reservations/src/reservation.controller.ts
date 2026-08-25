// apps/reservations/src/reservation.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ReservationService } from './reservation.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { JwtAuthGuard, CurrentUser, UserDto } from '@app/common';

@Controller('reservation')
export class ReservationController {
  constructor(private readonly reservationService: ReservationService) { }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createReservationDto: CreateReservationDto,
    @CurrentUser() user: UserDto,
  ) {
    return this.reservationService.create(createReservationDto, user);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@CurrentUser() user: UserDto) {
    return this.reservationService.findAll(user._id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: UserDto,
  ) {
    return this.reservationService.findOne(id, user._id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateReservationDto: UpdateReservationDto,
    @CurrentUser() user: UserDto,
  ) {
    return this.reservationService.update(id, updateReservationDto, user._id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: UserDto,
  ) {
    return this.reservationService.remove(id, user._id);
  }
}


// import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
// import { ReservationService } from './reservation.service';
// import { CreateReservationDto } from './dto/create-reservation.dto';
// import { UpdateReservationDto } from './dto/update-reservation.dto';
// import { JwtAuthGuard } from '@app/common';
// import { CurrentUser } from '@app/common';
// import { UserDto } from '@app/common';

// @Controller('reservation')
// export class ReservationController {
//   constructor(private readonly reservationService: ReservationService) { }
//   @UseGuards(JwtAuthGuard)
//   @Post()
//   async create(@Body() createReservationDto: CreateReservationDto, @CurrentUser() user: UserDto) {
//     const _user = await this.reservationService.create(createReservationDto, user._id);
//     console.log(user);
//     return _user;
//   }
//   @UseGuards(JwtAuthGuard)
//   @Get()
//   async findAll() {
//     return this.reservationService.findAll();
//   }
//   @UseGuards(JwtAuthGuard)
//   @Get(':id')
//   async findOne(@Param('id') id: string) {
//     return this.reservationService.findOne(id);
//   }
//   @UseGuards(JwtAuthGuard)
//   @Patch(':id')
//   async update(@Param('id') id: string, @Body() updateReservationDto: UpdateReservationDto) {
//     return this.reservationService.update(id, updateReservationDto);
//   }
//   @UseGuards(JwtAuthGuard)
//   @Delete(':id')
//   async remove(@Param('id') id: string) {
//     return this.reservationService.remove(id);
//   }
// }
