import { AbstractDocument } from "./abstract.schema";
import mongoose, { Model, UpdateQuery } from "mongoose";
import { Logger, NotFoundException } from "@nestjs/common";

type FilterQuery<T> = {
    [P in keyof T]?: T[P] | any;
} & Record<string, any>;

export abstract class AbstractRepository<TDocument extends AbstractDocument> {
    protected abstract readonly logger: Logger;
    constructor(
        protected readonly model: Model<TDocument>,
    ) { }

    async create(document: Omit<TDocument, '_id'>): Promise<TDocument> {
        const createdDocument = new this.model({
            ...document,
            _id: new mongoose.Types.ObjectId(),
        });
        return ((await createdDocument.save()).toJSON() as unknown as TDocument);
    }

    async findOne(filterQuery: FilterQuery<TDocument>): Promise<TDocument> {
        const document = await this.model.findOne(filterQuery, {}, { lean: true });
        if (!document) {
            this.logger.warn('Document was not found with filterQuery', filterQuery);
            throw new NotFoundException('Document not found');
        }
        return document as unknown as TDocument;
    }

    async findOneAndUpdate(
        filterQuery: FilterQuery<TDocument>,
        update: UpdateQuery<TDocument>,
    ): Promise<TDocument> {
        const document = await this.model.findOneAndUpdate(filterQuery, update, {
            new: true,
            lean: true,
        });
        if (!document) {
            this.logger.warn('Document was not found with filterQuery', filterQuery);
            throw new NotFoundException('Document not found');
        }
        return document as unknown as TDocument;
    }

    async find(filterQuery: FilterQuery<TDocument>): Promise<TDocument[]> {
        const documents = await this.model.find(filterQuery, {}, { lean: true });
        return documents as unknown as TDocument[];
    }

    async update(filterQuery: FilterQuery<TDocument>, update: UpdateQuery<TDocument>): Promise<TDocument> {
        const document = await this.model.findOneAndUpdate(filterQuery, update, {
            new: true,
            lean: true,
        });
        if (!document) {
            this.logger.warn('Document was not found with filterQuery', filterQuery);
            throw new NotFoundException('Document not found');
        }
        return document as unknown as TDocument;
    }

    async findOneAndDelete(filterQuery: FilterQuery<TDocument>): Promise<TDocument> {
        const document = await this.model.findOneAndDelete(filterQuery, { lean: true });
        if (!document) {
            this.logger.warn('Document was not found with filterQuery', filterQuery);
            throw new NotFoundException('Document not found');
        }
        return document as unknown as TDocument;
    }
}


// import { AbstractDocument } from "./abstract.schema";
// import mongoose, { Model, UpdateQuery, FilterQuery } from "mongoose";
// import { Logger, NotFoundException } from "@nestjs/common";

// export abstract class AbstractRepository<TDocument extends AbstractDocument> {
//     protected abstract readonly logger: Logger;
//     constructor(
//         protected readonly model: Model<TDocument>,
//     ) { }

//     async create(document: Omit<TDocument, '_id'>): Promise<TDocument> {
//         const createdDocument = new this.model({
//             ...document,
//             _id: new mongoose.Types.ObjectId(),
//         });
//         return ((await createdDocument.save()).toJSON() as unknown as TDocument);
//     }

//     async findOne(filterQuery: FilterQuery<TDocument>): Promise<TDocument> {
//         const document = await this.model.findOne(filterQuery, {}, { lean: true });
//         if (!document) {
//             this.logger.warn('Document was not found with filterQuery', filterQuery);
//             throw new NotFoundException('Document not found');
//         }
//         return document as unknown as TDocument;
//     }

//     async findOneAndUpdate(
//         filterQuery: FilterQuery<TDocument>,
//         update: UpdateQuery<TDocument>,
//     ): Promise<TDocument> {
//         const document = await this.model.findOneAndUpdate(filterQuery, update, {
//             new: true,
//             lean: true,
//         });
//         if (!document) {
//             this.logger.warn('Document was not found with filterQuery', filterQuery);
//             throw new NotFoundException('Document not found');
//         }
//         return document as unknown as TDocument;
//     }

//     async find(filterQuery: FilterQuery<TDocument>): Promise<TDocument[]> {
//         const documents = await this.model.find(filterQuery, {}, { lean: true });
//         return documents as unknown as TDocument[];
//     }

//     async update(filterQuery: FilterQuery<TDocument>, update: UpdateQuery<TDocument>): Promise<TDocument> {
//         const document = await this.model.findOneAndUpdate(filterQuery, update, {
//             new: true,
//             lean: true,
//         });
//         if (!document) {
//             this.logger.warn('Document was not found with filterQuery', filterQuery);
//             throw new NotFoundException('Document not found');
//         }
//         return document as unknown as TDocument;
//     }

//     async findOneAndDelete(filterQuery: FilterQuery<TDocument>): Promise<TDocument> {
//         const document = await this.model.findOneAndDelete(filterQuery, { lean: true });
//         if (!document) {
//             this.logger.warn('Document was not found with filterQuery', filterQuery);
//             throw new NotFoundException('Document not found');
//         }
//         return document as unknown as TDocument;
//     }
// }