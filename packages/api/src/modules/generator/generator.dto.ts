import { IsNotEmpty, IsString, IsIn } from 'class-validator';
import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

/**
 * Validador personalizado para restringir el número máximo de palabras.
 */
export function IsMaxWords(maxWords: number, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isMaxWords',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [maxWords],
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          // Contamos las palabras dividiendo por espacios en blanco continuos
          const words = value.trim().split(/\s+/).filter((w) => w.length > 0);
          return words.length <= args.constraints[0];
        },
        defaultMessage(args: ValidationArguments) {
          return `El campo ${args.property} no debe superar las ${args.constraints[0]} palabras.`;
        },
      },
    });
  };
}

export class GenerateThesisDto {
  @IsNotEmpty({ message: 'El título es obligatorio.' })
  @IsString({ message: 'El título debe ser una cadena de texto.' })
  @IsMaxWords(20, { message: 'El título de la tesis no debe exceder las 20 palabras.' })
  title!: string;

  @IsNotEmpty({ message: 'La línea de investigación es obligatoria.' })
  @IsString({ message: 'La línea de investigación debe ser una cadena de texto.' })
  @IsIn(
    [
      'Gestión de Gobierno y Servicios de TIC',
      'Gestión de Proyectos de TIC',
      'Gestión de Desarrollo de Software',
      'Gestión de Infraestructura y Comunicaciones',
      'Gestión de la Seguridad de la Información',
    ],
    {
      message:
        'La línea de investigación debe ser una de las 5 oficiales de la UNT: Gestión de Gobierno y Servicios de TIC, Gestión de Proyectos de TIC, Gestión de Desarrollo de Software, Gestión de Infraestructura y Comunicaciones, o Gestión de la Seguridad de la Información.',
    },
  )
  lineOfResearch!: string;

  @IsNotEmpty({ message: 'El campus es obligatorio.' })
  @IsString({ message: 'El campus debe ser una cadena de texto.' })
  @IsIn(['Trujillo', 'Guadalupe'], {
    message: 'El campus debe ser obligatoriamente "Trujillo" o "Guadalupe".',
  })
  campus!: string;

  @IsNotEmpty({ message: 'El tipo de producto académico es obligatorio.' })
  @IsString({ message: 'El tipo de producto académico debe ser una cadena de texto.' })
  @IsIn(['THESIS', 'ARTICLE'], {
    message: 'El tipo de producto académico debe ser "THESIS" o "ARTICLE".',
  })
  productType!: 'THESIS' | 'ARTICLE';

  @IsNotEmpty({ message: 'El nombre del autor es obligatorio.' })
  @IsString({ message: 'El nombre del autor debe ser una de cadena de texto.' })
  authorName!: string;

  @IsNotEmpty({ message: 'El nombre del asesor es obligatorio.' })
  @IsString({ message: 'El nombre del asesor debe ser una de cadena de texto.' })
  advisorName!: string;
}
